#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_URL:?APP_URL is required, for example https://staging.getsawa.app}"
: "${CRON_SECRET:?CRON_SECRET is required}"

job="${1:-}"
case "$job" in
  domain-sync) route="/api/cron/domain-sync" ;;
  domain-expiry) route="/api/cron/domain-expiry" ;;
  provisioning-recovery) route="/api/cron/provisioning-recovery" ;;
  billing-renewals) route="/api/cron/billing-renewals" ;;
  payment-reconciliation) route="/api/cron/payment-reconciliation" ;;
  renewal-reminders) route="/api/cron/renewal-reminders" ;;
  auction-close) route="/api/cron/auction-close" ;;
  pricing-sync) route="/api/cron/pricing-sync" ;;
  message-delivery) route="/api/cron/message-delivery" ;;
  developer-webhooks) route="/api/cron/developer-webhooks" ;;
  security-maintenance) route="/api/cron/security-maintenance" ;;
  analytics-snapshot) route="/api/cron/analytics-snapshot" ;;
  *)
    echo "Usage: $0 {domain-sync|domain-expiry|provisioning-recovery|billing-renewals|payment-reconciliation|renewal-reminders|auction-close|pricing-sync|message-delivery|developer-webhooks|security-maintenance|analytics-snapshot}" >&2
    exit 2
    ;;
esac

base="${APP_URL%/}"
printf 'Authorization: Bearer %s\n' "$CRON_SECRET" | \
  curl --fail-with-body --silent --show-error \
    --request GET \
    --header @- \
    --header "x-getsawa-manual-recovery: true" \
    "$base$route"
printf '\nReconciliation job completed: %s\n' "$job"
