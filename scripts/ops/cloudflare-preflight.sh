#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging)
    expected_url="https://staging.getsawa.app"
    expected_host="staging.getsawa.app"
    expected_worker="getsawa-staging"
    ;;
  production)
    expected_url="https://getsawa.app"
    expected_host="getsawa.app"
    expected_worker="getsawa-production"
    ;;
  *)
    echo "Usage: $0 {staging|production}" >&2
    exit 2
    ;;
esac

for command in node npm npx curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 1; }
done

required=(APP_URL APP_NAME DATABASE_URL SESSION_SECRET CRON_SECRET CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN WEBSITE_PLATFORM_HOST CLOUDFLARE_WORKER_SERVICE_NAME)
missing=()
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then missing+=("$key"); fi
done
if (( ${#missing[@]} > 0 )); then
  printf 'Missing required deployment variables: %s\n' "${missing[*]}" >&2
  exit 1
fi

[[ "$APP_URL" == "$expected_url" ]] || { echo "APP_URL must be $expected_url for $environment." >&2; exit 1; }
[[ "$WEBSITE_PLATFORM_HOST" == "$expected_host" ]] || { echo "WEBSITE_PLATFORM_HOST must be $expected_host for $environment." >&2; exit 1; }
[[ "$CLOUDFLARE_WORKER_SERVICE_NAME" == "$expected_worker" ]] || { echo "CLOUDFLARE_WORKER_SERVICE_NAME must be $expected_worker for $environment." >&2; exit 1; }

if [[ "$environment" == "staging" && "${CONFIRM_STAGING_ISOLATED:-}" != "STAGING_IS_ISOLATED" ]]; then
  echo "Set CONFIRM_STAGING_ISOLATED=STAGING_IS_ISOLATED only after confirming staging uses its own database and non-production/test data." >&2
  exit 1
fi

if [[ "$environment" == "production" && "${CONFIRM_PRODUCTION_DEPLOY:-}" != "DEPLOY_GETSAWA_PRODUCTION" ]]; then
  echo "Set CONFIRM_PRODUCTION_DEPLOY=DEPLOY_GETSAWA_PRODUCTION for an approved production deployment." >&2
  exit 1
fi

npx wrangler whoami >/dev/null
printf 'Cloudflare preflight passed for %s. Secret values were not printed.\n' "$environment"
