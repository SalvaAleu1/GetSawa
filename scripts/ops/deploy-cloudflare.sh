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

if [[ "$environment" == "production" && "${CONFIRM_PRODUCTION_CUTOVER:-}" != "SWITCH_GETSAWA_TO_CLOUDFLARE" ]]; then
  echo "Production configuration now owns getsawa.app and activates production crons. Set CONFIRM_PRODUCTION_CUTOVER=SWITCH_GETSAWA_TO_CLOUDFLARE only during the approved Phase 29 cutover." >&2
  exit 1
fi

printf 'Checking database migration state for %s...\n' "$environment"
npx prisma generate

migration_database_url="${DIRECT_URL:-${DATABASE_URL:-}}"
if [[ -z "$migration_database_url" ]]; then
  echo "Missing database connection for Prisma migrations. Set DIRECT_URL (recommended for Neon) or DATABASE_URL." >&2
  exit 1
fi

DATABASE_URL="$migration_database_url" npx prisma migrate status

if [[ "${APPLY_DATABASE_MIGRATIONS:-}" == "APPLY_REVIEWED_MIGRATIONS" ]]; then
  DATABASE_URL="$migration_database_url" npx prisma migrate deploy
else
  echo "Database migrations were not applied. Set APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS after reviewing the migration plan."
fi

printf 'Building GetSawa for Cloudflare environment %s...\n' "$environment"
npx opennextjs-cloudflare build --env="$environment"

if [[ "$environment" == "production" && "${CONFIRM_PRODUCTION_WORKER_UPLOAD:-}" != "UPLOAD_PRODUCTION_WORKER" ]]; then
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
