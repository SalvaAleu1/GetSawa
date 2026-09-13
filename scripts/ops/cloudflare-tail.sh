#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
case "$environment" in
  staging|production) ;;
  *) echo "Usage: $0 {staging|production}" >&2; exit 2 ;;
esac

exec npx wrangler tail --env="$environment"
