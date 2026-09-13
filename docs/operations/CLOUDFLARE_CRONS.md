# Cloudflare scheduled-job plan

The custom Worker maps these schedules to authenticated internal cron routes. Keep this table synchronized with `cloudflare-worker.ts` and `wrangler.jsonc`.

| Cron (UTC) | Route | Purpose |
| --- | --- | --- |
| `17 * * * *` | `/api/cron/domain-sync` | Registrar/domain convergence |
| `37 * * * *` | `/api/cron/domain-expiry` | Expiry state reconciliation |
| `*/10 * * * *` | `/api/cron/provisioning-recovery` | Retry/reconcile provisioning |
| `13 * * * *` | `/api/cron/billing-renewals` | Protected recurring renewal work |
| `*/15 * * * *` | `/api/cron/payment-reconciliation` | Payment/order provider convergence |
| `23 6 * * *` | `/api/cron/renewal-reminders` | Renewal notifications |
| `*/5 * * * *` | `/api/cron/auction-close` | Auction closing/payment-window processing |
| `7 */6 * * *` | `/api/cron/pricing-sync` | Wholesale pricing synchronization |
| `*/6 * * * *` | `/api/cron/message-delivery` | Transactional message retry/delivery |
| `9,39 * * * *` | `/api/cron/developer-webhooks` | Developer webhook delivery/retry |
| `41 3 * * *` | `/api/cron/security-maintenance` | Security maintenance tasks |
| `31 2 * * *` | `/api/cron/analytics-snapshot` | Daily analytics snapshot |

## Activation rules

- Staging schedules may run only against an isolated staging database. Seeded test records must not refer to real customer orders/domains unless a provider-specific test is explicitly approved.
- Production schedules stay disabled during Phase 28 because Vercel still has scheduled jobs. Enabling Cloudflare production schedules before disabling the previous scheduler could duplicate billing/provisioning/domain work.
- Phase 29 activates the full production cron list as one controlled scheduler handoff and verifies the Cloudflare scheduled-job history.
- Exactly one production scheduler authority is allowed at any moment.
