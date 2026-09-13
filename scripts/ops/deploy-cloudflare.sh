#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging|production) ;;
  *) echo "Usage: $0 {staging|production}" >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

./scripts/ops/cloudflare-preflight.sh "$environment"

printf 'Checking database migration state for %s...\n' "$environment"
npx prisma generate
npx prisma migrate status

if [[ "${APPLY_DATABASE_MIGRATIONS:-}" == "APPLY_REVIEWED_MIGRATIONS" ]]; then
  npx prisma migrate deploy
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
elif [[ -n "${VERIFY_URL:-}" ]]; then
  APP_URL="$VERIFY_URL" ./scripts/ops/verify-deployment-health.sh
else
  echo "Production Worker uploaded without changing getsawa.app. Set VERIFY_URL to its workers.dev/preview URL for HTTP smoke verification."
fi
