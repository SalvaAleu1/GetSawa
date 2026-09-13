#!/usr/bin/env bash
set -Eeuo pipefail

APP_URL="${APP_URL:-https://getsawa.app}"
base="${APP_URL%/}"

./scripts/ops/verify-deployment-health.sh

headers="$(mktemp)"
body="$(mktemp)"
trap 'rm -f "$headers" "$body"' EXIT

curl --fail-with-body --silent --show-error --dump-header "$headers" --output "$body" "$base/"

grep -qi '^x-getsawa-runtime: cloudflare-worker' "$headers" || {
  echo "Cutover verification failed: getsawa.app is not fingerprinted as the GetSawa Cloudflare Worker." >&2
  exit 1
}
grep -qi '^x-getsawa-environment: production' "$headers" || {
  echo "Cutover verification failed: Cloudflare Worker is not running with APP_ENV=production." >&2
  exit 1
}

paypal_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'content-type: application/json' \
  --data '{}' \
  "$base/api/webhooks/paypal")
if [[ "$paypal_status" != "400" ]]; then
  echo "PayPal webhook readiness failed: expected HTTP 400 for a deliberately invalid event, got $paypal_status. HTTP 503 means PayPal/webhook configuration is missing." >&2
  exit 1
fi

for path in /login /domains /products /support; do
  status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base$path")
  if [[ "$status" -lt 200 || "$status" -ge 400 ]]; then
    echo "Cutover verification failed for $path (HTTP $status)." >&2
    exit 1
  fi
  printf 'OK %s -> HTTP %s\n' "$path" "$status"
done

printf 'Production cutover HTTP/runtime verification passed for %s.\n' "$base"
