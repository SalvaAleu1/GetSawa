#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_URL:?APP_URL is required}"
base="${APP_URL%/}"

for path in / /robots.txt /sitemap.xml /manifest.webmanifest; do
  code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base$path")
  if [[ "$code" -lt 200 || "$code" -ge 400 ]]; then
    echo "Health verification failed for $path (HTTP $code)." >&2
    exit 1
  fi
  printf 'OK %s -> HTTP %s\n' "$path" "$code"
done
