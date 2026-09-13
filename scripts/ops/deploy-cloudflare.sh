#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging)
    export APP_URL="${APP_URL:-https://staging.getsawa.app}"
    export APP_NAME="GetSawa"
    export WEBSITE_PLATFORM_HOST="${WEBSITE_PLATFORM_HOST:-staging.getsawa.app}"
    export CLOUDFLARE_WORKER_SERVICE_NAME="getsawa-staging"
    ;;
  production)
    # Pre-domain deployment: publish the root Worker to workers.dev first.
    # Cloudflare assigns the exact public hostname after upload, so do not bake
    # a future custom domain into the application during this phase.
    export APP_NAME="GetSawa"
    export CLOUDFLARE_WORKER_SERVICE_NAME="getsawa"
    if [[ "${APP_URL:-}" == "https://getsawa.app" ]]; then unset APP_URL; fi
    if [[ "${WEBSITE_PLATFORM_HOST:-}" == "getsawa.app" ]]; then unset WEBSITE_PLATFORM_HOST; fi
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
  echo "Production deployment is approved only with CONFIRM_PRODUCTION_CUTOVER=SWITCH_GETSAWA_TO_CLOUDFLARE." >&2
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
  echo "Fresh PostgreSQL database detected. Creating the current GetSawa Prisma schema..."
  DATABASE_URL="$migration_database_url" npx prisma db push --skip-generate

  echo "Creating retained raw-SQL operational tables before baselining migrations..."
  DIRECT_URL="$migration_database_url" DATABASE_URL="$migration_database_url" node scripts/ops/repair-baselined-database.mjs

  echo "Baselining retained Prisma migrations against the complete schema..."
  for migration_dir in prisma/migrations/*; do
    [[ -d "$migration_dir" ]] || continue
    migration_name="$(basename "$migration_dir")"
    DATABASE_URL="$migration_database_url" npx prisma migrate resolve --applied "$migration_name"
  done
else
  DIRECT_URL="$migration_database_url" DATABASE_URL="$migration_database_url" node scripts/ops/repair-baselined-database.mjs

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

# Safe/idempotent seed only creates baseline TLD configuration. It never creates
# customers, orders, payments, domains, provider credentials or admin accounts.
echo "Seeding safe baseline configuration..."
DATABASE_URL="$migration_database_url" npm run db:seed

printf 'Building GetSawa for Cloudflare environment %s...\n' "$environment"
if [[ "$environment" == "staging" ]]; then
  npx opennextjs-cloudflare build --env=staging
else
  npx opennextjs-cloudflare build
fi

if [[ "${WORKERS_CI:-}" != "1" && "$environment" == "production" && "${CONFIRM_PRODUCTION_WORKER_UPLOAD:-}" != "UPLOAD_PRODUCTION_WORKER" ]]; then
  echo "Production build completed, but upload is blocked. Set CONFIRM_PRODUCTION_WORKER_UPLOAD=UPLOAD_PRODUCTION_WORKER after review." >&2
  exit 1
fi

printf 'Deploying GetSawa Cloudflare environment %s...\n' "$environment"
if [[ "$environment" == "staging" ]]; then
  npx opennextjs-cloudflare deploy --env=staging -- --keep-vars
  APP_URL="https://staging.getsawa.app" ./scripts/ops/verify-deployment-health.sh
else
  npx opennextjs-cloudflare deploy -- --keep-vars
  echo "GetSawa Worker uploaded as 'getsawa' with workers.dev enabled."
  echo "Use the workers.dev URL printed by Wrangler for preview/testing. No custom domain is required at this stage."
fi
