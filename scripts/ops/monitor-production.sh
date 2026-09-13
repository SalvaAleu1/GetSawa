#!/usr/bin/env bash
set -Eeuo pipefail

APP_URL="${APP_URL:-https://getsawa.app}"
base="${APP_URL%/}"
max_seconds="${MONITOR_MAX_SECONDS:-4}"
failures=0

check() {
  local path="$1"
  local output
  output=$(curl --silent --show-error --output /dev/null --write-out '%{http_code} %{time_total}' --max-time 15 "$base$path") || { echo "FAIL $path network error"; failures=$((failures + 1)); return; }
  local code="${output%% *}"
  local seconds="${output##* }"
  if [[ "$code" -lt 200 || "$code" -ge 400 ]]; then
    echo "FAIL $path HTTP $code (${seconds}s)"
    failures=$((failures + 1))
  else
    echo "OK   $path HTTP $code (${seconds}s)"
  fi
  awk -v actual="$seconds" -v max="$max_seconds" 'BEGIN { exit !(actual > max) }' && {
    echo "WARN $path exceeded ${max_seconds}s threshold (${seconds}s)"
  } || true
}

for path in / /login /domains /products /support /legal/terms /legal/privacy /robots.txt /sitemap.xml /manifest.webmanifest; do
  check "$path"
done

headers=$(mktemp)
trap 'rm -f "$headers"' EXIT
curl --silent --show-error --output /dev/null --dump-header "$headers" --max-time 15 "$base/" || failures=$((failures + 1))
grep -qi '^x-getsawa-runtime: cloudflare-worker' "$headers" || { echo "FAIL production runtime fingerprint missing"; failures=$((failures + 1)); }
grep -qi '^x-getsawa-environment: production' "$headers" || { echo "FAIL production environment fingerprint missing"; failures=$((failures + 1)); }

paypal_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 15 --request POST --header 'content-type: application/json' --data '{}' "$base/api/webhooks/paypal" || printf '000')
if [[ "$paypal_status" != "400" ]]; then
  echo "FAIL PayPal webhook readiness expected HTTP 400 for invalid event; got $paypal_status"
  failures=$((failures + 1))
else
  echo "OK   PayPal webhook receiver configured"
fi

if (( failures > 0 )); then
  echo "Production monitor failed with $failures blocking check(s)." >&2
  exit 1
fi

echo "Production public/runtime monitor passed."
