#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging)
    expected_worker="getsawa-staging"
    ;;
  production)
    expected_worker="getsawa"
    ;;
  *)
    echo "Usage: $0 {staging|production}" >&2
    exit 2
    ;;
esac

for command in node npm npx curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 1; }
done

# Cloudflare Workers Builds has two different secret scopes:
# - build secrets, available to this shell
# - runtime Worker secrets, available only after deployment
# SESSION_SECRET and CRON_SECRET are runtime secrets and must not be duplicated
# into the build environment merely to satisfy preflight.
#
# During the pre-domain Workers.dev phase we intentionally do NOT require
# APP_URL or WEBSITE_PLATFORM_HOST, because Cloudflare assigns the exact
# workers.dev hostname only after the Worker has deployed.
required=(APP_NAME DATABASE_URL CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_WORKER_SERVICE_NAME)

if [[ "${WORKERS_CI:-}" == "1" ]]; then
  # DIRECT_URL is used for Prisma schema/migration administration on Neon.
  required+=(DIRECT_URL)
else
  # Local/third-party CI deployments authenticate Wrangler explicitly.
  required+=(SESSION_SECRET CRON_SECRET CLOUDFLARE_API_TOKEN)
fi

missing=()
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then missing+=("$key"); fi
done
if (( ${#missing[@]} > 0 )); then
  printf 'Missing required deployment variables: %s\n' "${missing[*]}" >&2
  exit 1
fi

[[ "$CLOUDFLARE_WORKER_SERVICE_NAME" == "$expected_worker" ]] || { echo "CLOUDFLARE_WORKER_SERVICE_NAME must be $expected_worker for $environment." >&2; exit 1; }

# Interactive/local deployments retain explicit safety confirmations. In
# Cloudflare Workers Builds, selecting the environment-specific deploy command
# is itself the deployment approval and every push to the configured branch may deploy.
if [[ "${WORKERS_CI:-}" != "1" ]]; then
  if [[ "$environment" == "staging" && "${CONFIRM_STAGING_ISOLATED:-}" != "STAGING_IS_ISOLATED" ]]; then
    echo "Set CONFIRM_STAGING_ISOLATED=STAGING_IS_ISOLATED only after confirming staging uses its own database and non-production/test data." >&2
    exit 1
  fi

  if [[ "$environment" == "production" && "${CONFIRM_PRODUCTION_DEPLOY:-}" != "DEPLOY_GETSAWA_PRODUCTION" ]]; then
    echo "Set CONFIRM_PRODUCTION_DEPLOY=DEPLOY_GETSAWA_PRODUCTION for an approved production deployment." >&2
    exit 1
  fi
fi

npx wrangler whoami >/dev/null
printf 'Cloudflare preflight passed for %s. Secret values were not printed.\n' "$environment"
