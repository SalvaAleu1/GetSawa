# Provider reconciliation and recovery

GetSawa never treats its database as proof that an external side effect happened. After outage, restore or uncertain request outcome, provider truth must be reconciled before retrying actions that can charge money, register/renew/transfer a domain, provision a service, settle an auction or send a payout.

## Existing recovery jobs

The Cloudflare scheduled worker already maps these authenticated jobs:

- `domain-sync`
- `domain-expiry`
- `provisioning-recovery`
- `billing-renewals`
- `payment-reconciliation`
- `renewal-reminders`
- `auction-close`
- `pricing-sync`
- `message-delivery`
- `developer-webhooks`
- `security-maintenance`
- `analytics-snapshot`

Use `scripts/ops/run-reconciliation.sh <job>` for an approved manual recovery run. It sends the cron secret through stdin instead of placing the value in the command argument list.

## Recovery ordering after database restoration

1. `payment-reconciliation` — converge PayPal/order/payment state first.
2. `domain-sync` — converge registrar state without creating duplicate registration attempts.
3. `provisioning-recovery` — resume idempotent hosting/email/security fulfillment.
4. `billing-renewals` only after current payment/provider state is known.
5. `auction-close` only after payment/inventory reservations are reconciled.
6. `message-delivery` and `developer-webhooks` after authoritative state is stable.
7. `pricing-sync`, `domain-expiry`, `renewal-reminders`, `security-maintenance` and `analytics-snapshot` can then return to normal cadence.

If a provider is unavailable, keep dependent customer actions fail-closed rather than replacing provider truth with guessed state.

## Uncertain payment requests

Never create a second PayPal capture solely because the first request timed out. Locate the durable payment/order reference, query provider state/reconciliation, and only retry through the application's idempotent payment path after the previous attempt is known not to have captured.

## Uncertain registrar requests

Never register or renew a domain twice after a timeout. Query the registrar and reconcile the domain/provider-order reference first. Registry premium prices must be re-quoted if the prior quote has expired.

## Provisioning recovery

Hosting, email, Cloudflare security and website publishing recovery must use provider-backed service-instance state. A database status change alone is not evidence of successful provider provisioning.
