#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging)
    export APP_NAME="CloudSawa"
    export CLOUDFLARE_WORKER_SERVICE_NAME="cloudsawa-staging"
    export APP_URL="https://cloudsawa-staging.aleuwol12.workers.dev"
    export WEBSITE_PLATFORM_HOST="cloudsawa-staging.aleuwol12.workers.dev"
    ;;
  production)
    # The production Worker name and workers.dev hostname are now established.
    # Set them explicitly so stale build variables cannot generate links for a
    # retired Worker or former public brand.
    export APP_NAME="CloudSawa"
    export CLOUDFLARE_WORKER_SERVICE_NAME="cloudsawa"
    export APP_URL="https://cloudsawa.aleuwol12.workers.dev"
    export WEBSITE_PLATFORM_HOST="cloudsawa.aleuwol12.workers.dev"
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
cutover_active="$(node -e 'const fs=require("fs");const w=JSON.parse(fs.readFileSync("wrangler.jsonc","utf8"));const routes=w.routes||[];process.stdout.write(routes.some(r=>r&&r.pattern==="cloudsawa.com"&&r.custom_domain===true)?"1":"0")')"

if [[ "$environment" == "production" && "$cutover_active" == "1" ]]; then
  export APP_URL="https://cloudsawa.com"
  export WEBSITE_PLATFORM_HOST="cloudsawa.com"
fi

if [[ "${WORKERS_CI:-}" != "1" && "$environment" == "production" && "$cutover_active" == "1" && "${CONFIRM_PRODUCTION_CUTOVER:-}" != "SWITCH_CLOUDSAWA_TO_CLOUDFLARE" ]]; then
  echo "Custom-domain cutover is approved only with CONFIRM_PRODUCTION_CUTOVER=SWITCH_CLOUDSAWA_TO_CLOUDFLARE." >&2
  exit 1
fi

# Run the repository-wide static and unit-test gate before touching production
# schema state. The generated client enables Prisma driver-adapter support so
# the same application code can use Neon safely inside Cloudflare Workers.
printf 'Generating Prisma client for repository verification...\n'
npm run prisma:generate
printf 'Running full TypeScript repository check...\n'
npm run typecheck -- --pretty false
printf 'Running unit tests...\n'
npm test

# Cloudflare Workers Builds and Worker runtime secrets are separate scopes.
# DATABASE_URL is already available here for migration/build work; copy that
# pooled URL into the Worker itself so server-rendered routes can reach Neon.
# Launch-provider secrets are synchronized only when they are present in the
# build environment; existing dashboard secrets remain untouched otherwise.
if [[ "${WORKERS_CI:-}" == "1" ]]; then
  echo "Synchronizing runtime secrets to Worker '$CLOUDFLARE_WORKER_SERVICE_NAME'..."
  # Build-time and Worker-runtime secret scopes are separate in Cloudflare.
  # Copy every launch-critical credential that is present in the build
  # environment so a successful build cannot silently deploy a Worker that
  # has database access but no registrar/payment/email/security credentials.
  runtime_secrets=(
    DATABASE_URL
    SESSION_SECRET
    CRON_SECRET
    NAMESILO_API_KEY
    PAYPAL_CLIENT_ID
    PAYPAL_CLIENT_SECRET
    PAYPAL_WEBHOOK_ID
    SMTP_HOST
    SMTP_USER
    SMTP_PASSWORD
    CLOUDFLARE_ACCOUNT_ID
    CLOUDFLARE_API_TOKEN
  )
  for secret_name in "${runtime_secrets[@]}"; do
    secret_value="${!secret_name:-}"
    if [[ -n "$secret_value" ]]; then
      printf '%s' "$secret_value" | npx wrangler secret put "$secret_name" --name "$CLOUDFLARE_WORKER_SERVICE_NAME" >/dev/null
      echo "Runtime secret $secret_name is configured."
    fi
  done
fi

printf 'Preparing database for %s...\n' "$environment"
runtime_database_url="${DATABASE_URL:-}"
if [[ -z "$runtime_database_url" ]]; then
  echo "Missing DATABASE_URL for database readiness verification." >&2
  exit 1
fi

if [[ "${WORKERS_CI:-}" == "1" ]]; then
  # Cloudflare Workers Builds should not open a direct PostgreSQL socket or
  # mutate production schema. Verify the already-reviewed database over Neon's
  # HTTPS query path instead. This is compatible with Cloudflare build egress
  # and still blocks deployment when migrations/schema/baseline are stale.
  if [[ "${APPLY_DATABASE_MIGRATIONS:-}" == "APPLY_REVIEWED_MIGRATIONS" ]]; then
    echo "Refusing to apply database migrations from Cloudflare Workers Builds. Apply reviewed migrations from a migration-capable operator environment first, then redeploy." >&2
    exit 1
  fi
  echo "Verifying committed migrations, operational schema and baseline configuration over Neon HTTPS..."
  DATABASE_URL="$runtime_database_url" node scripts/ops/check-migration-parity.mjs
  echo "Database readiness verified. Cloudflare deployment will not mutate production schema."
else
  # Local/operator deployments retain the explicit migration path because they
  # can use a direct PostgreSQL connection with session continuity.
  user_table_count="$(DATABASE_URL="$runtime_database_url" node <<'NODE'
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
    if [[ "${APPLY_DATABASE_MIGRATIONS:-}" != "APPLY_REVIEWED_MIGRATIONS" ]]; then
      echo "Fresh PostgreSQL database detected. Refusing automatic production bootstrap without APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS." >&2
      exit 1
    fi

    migration_database_url="${DIRECT_URL:-}"
    if [[ -z "$migration_database_url" ]]; then
      echo "DIRECT_URL is required to initialize a fresh database." >&2
      exit 1
    fi

    echo "Fresh PostgreSQL database detected. Creating the reviewed CloudSawa Prisma schema..."
    DATABASE_URL="$migration_database_url" npx prisma db push --skip-generate

    echo "Creating retained raw-SQL operational tables before baselining migrations..."
    DIRECT_URL="$migration_database_url" DATABASE_URL="$migration_database_url" node scripts/ops/repair-baselined-database.mjs

    echo "Baselining retained Prisma migrations against the complete schema..."
    for migration_dir in prisma/migrations/*; do
      [[ -d "$migration_dir" ]] || continue
      migration_name="$(basename "$migration_dir")"
      DATABASE_URL="$migration_database_url" npx prisma migrate resolve --applied "$migration_name"
    done
  elif [[ "${APPLY_DATABASE_MIGRATIONS:-}" == "APPLY_REVIEWED_MIGRATIONS" ]]; then
    migration_database_url="${DIRECT_URL:-}"
    if [[ -z "$migration_database_url" ]]; then
      echo "DIRECT_URL is required when applying reviewed database migrations." >&2
      exit 1
    fi

    echo "Applying explicitly reviewed Prisma migrations over the direct Neon connection..."
    DIRECT_URL="$migration_database_url" DATABASE_URL="$migration_database_url" node scripts/ops/repair-baselined-database.mjs
    DATABASE_URL="$migration_database_url" npx prisma migrate deploy
  fi

  echo "Verifying migration/schema parity after operator database preparation..."
  DATABASE_URL="$runtime_database_url" node scripts/ops/check-migration-parity.mjs

  # The seed is deliberately kept out of Cloudflare Builds. It is a database
  # mutation and belongs to the migration-capable operator path.
  echo "Seeding safe baseline configuration..."
  DATABASE_URL="$runtime_database_url" npm run db:seed
fi

printf 'Building CloudSawa for Cloudflare environment %s...\n' "$environment"
if [[ "$environment" == "staging" ]]; then
  npx opennextjs-cloudflare build --env=staging
else
  npx opennextjs-cloudflare build
fi

if [[ "${WORKERS_CI:-}" != "1" && "$environment" == "production" && "${CONFIRM_PRODUCTION_WORKER_UPLOAD:-}" != "UPLOAD_PRODUCTION_WORKER" ]]; then
  echo "Production build completed, but upload is blocked. Set CONFIRM_PRODUCTION_WORKER_UPLOAD=UPLOAD_PRODUCTION_WORKER after review." >&2
  exit 1
fi

printf 'Deploying CloudSawa Cloudflare environment %s...\n' "$environment"
if [[ "$environment" == "staging" ]]; then
  npx opennextjs-cloudflare deploy --env=staging -- --keep-vars
  if [[ -n "${APP_URL:-}" ]]; then
    ./scripts/ops/verify-deployment-health.sh
  else
    echo "CloudSawa staging Worker uploaded. Use the workers.dev URL printed by Wrangler, then set APP_URL to that exact URL for outside-in verification."
  fi
else
  npx opennextjs-cloudflare deploy -- --keep-vars
  if [[ "$cutover_active" == "1" ]]; then
    APP_URL="https://cloudsawa.com" ./scripts/ops/verify-production-cutover.sh
    echo "CloudSawa production custom-domain deployment verified at https://cloudsawa.com."
  else
    APP_URL="https://cloudsawa.aleuwol12.workers.dev" ./scripts/ops/verify-deployment-health.sh
    echo "CloudSawa Worker uploaded and verified at https://cloudsawa.aleuwol12.workers.dev."
  fi
fi
