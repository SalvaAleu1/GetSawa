#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging)
    export APP_URL="${APP_URL:-https://staging.getsawa.app}"
    export APP_NAME="${APP_NAME:-GetSawa}"
    export WEBSITE_PLATFORM_HOST="${WEBSITE_PLATFORM_HOST:-staging.getsawa.app}"
    export CLOUDFLARE_WORKER_SERVICE_NAME="${CLOUDFLARE_WORKER_SERVICE_NAME:-getsawa-staging}"
    ;;
  production)
    export APP_URL="${APP_URL:-https://getsawa.app}"
    export APP_NAME="${APP_NAME:-GetSawa}"
    export WEBSITE_PLATFORM_HOST="${WEBSITE_PLATFORM_HOST:-getsawa.app}"
    export CLOUDFLARE_WORKER_SERVICE_NAME="${CLOUDFLARE_WORKER_SERVICE_NAME:-getsawa-production}"
    ;;
  *)
    echo "Usage: $0 {staging|production}" >&2
    exit 2
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

./scripts/ops/cloudflare-preflight.sh "$environment"

# Interactive/local production deploys keep explicit cutover confirmation.
# In Cloudflare Workers Builds, selecting the production deploy command is the
# deployment approval and pushes to the configured production branch may deploy.
if [[ "${WORKERS_CI:-}" != "1" && "$environment" == "production" && "${CONFIRM_PRODUCTION_CUTOVER:-}" != "SWITCH_GETSAWA_TO_CLOUDFLARE" ]]; then
  echo "Production configuration now owns getsawa.app and activates production crons. Set CONFIRM_PRODUCTION_CUTOVER=SWITCH_GETSAWA_TO_CLOUDFLARE only during the approved Phase 29 cutover." >&2
  exit 1
fi

# Run the repository-wide static and unit-test gate before touching production
# schema state. `tsc` reports the complete TypeScript error set in one run,
# avoiding one-error-per-Next-build deployment loops.
printf 'Generating Prisma client for repository verification...\n'
npx prisma generate
printf 'Running full TypeScript repository check...\n'
npm run typecheck -- --pretty false
printf 'Running unit tests...\n'
npm test

printf 'Preparing database for %s...\n' "$environment"
migration_database_url="${DIRECT_URL:-${DATABASE_URL:-}}"
if [[ -z "$migration_database_url" ]]; then
  echo "Missing database connection for Prisma administration. Set DIRECT_URL (recommended for Neon) or DATABASE_URL." >&2
  exit 1
fi

# Count existing application tables using the direct database connection.
# A brand-new Neon database has zero public base tables. Only in that exact
# state do we bootstrap the current schema and baseline the historical migration
# folders, because this repository's earliest retained migration is incremental.
user_table_count="$(DATABASE_URL="$migration_database_url" node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    process.stdout.write(String(rows?.[0]?.count ?? 0));
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
)"

if [[ "$user_table_count" == "0" ]]; then
  echo "Fresh PostgreSQL database detected. Creating the current GetSawa schema..."
  DATABASE_URL="$migration_database_url" npx prisma db push --skip-generate

  echo "Baselining retained Prisma migrations against the freshly created schema..."
  for migration_dir in prisma/migrations/*; do
    [[ -d "$migration_dir" ]] || continue
    migration_name="$(basename "$migration_dir")"
    DATABASE_URL="$migration_database_url" npx prisma migrate resolve --applied "$migration_name"
  done
else
  echo "Existing database detected. Applying committed Prisma migrations..."
  if [[ "${WORKERS_CI:-}" == "1" ]]; then
    DATABASE_URL="$migration_database_url" npx prisma migrate deploy
  else
    DATABASE_URL="$migration_database_url" npx prisma migrate status
    if [[ "${APPLY_DATABASE_MIGRATIONS:-}" == "APPLY_REVIEWED_MIGRATIONS" ]]; then
      DATABASE_URL="$migration_database_url" npx prisma migrate deploy
    else
      echo "Database migrations were not applied. Set APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS after reviewing the migration plan."
    fi
  fi
fi

printf 'Building GetSawa for Cloudflare environment %s...\n' "$environment"
npx opennextjs-cloudflare build --env="$environment"

if [[ "${WORKERS_CI:-}" != "1" && "$environment" == "production" && "${CONFIRM_PRODUCTION_WORKER_UPLOAD:-}" != "UPLOAD_PRODUCTION_WORKER" ]]; then
  echo "Production build completed, but upload is blocked. Set CONFIRM_PRODUCTION_WORKER_UPLOAD=UPLOAD_PRODUCTION_WORKER after review." >&2
  exit 1
fi

printf 'Deploying GetSawa Cloudflare environment %s...\n' "$environment"
npx opennextjs-cloudflare deploy --env="$environment" -- --keep-vars

if [[ "$environment" == "staging" ]]; then
  APP_URL="https://staging.getsawa.app" ./scripts/ops/verify-deployment-health.sh
else
  APP_URL="https://getsawa.app" ./scripts/ops/verify-production-cutover.sh
fi
