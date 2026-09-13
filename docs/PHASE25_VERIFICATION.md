# Phase 25 Verification — Analytics, Observability & Finance Reporting

Phase 25 is implementation-complete at the repository gate. This record does not claim a Cloudflare/OpenNext build, production traffic validation, external observability SaaS integration or accountant/auditor certification.

## Business and finance analytics

- `/admin/analytics` reads authoritative GetSawa tables for captured gross, refunds, provider fees, net settlement, disputes, customers, orders, paid invoices, active domains, support load and campaign conversion.
- Product reporting groups paid order items by product and reports units, revenue and a clearly labeled current-cost margin estimate from verified catalog wholesale metadata.
- Rows with missing wholesale cost are surfaced instead of silently treating unknown cost as zero profit evidence.
- Signup cohorts report whether a customer reached a paid invoice within 30 days of signup.
- Campaign click-to-paid-order conversion is calculated from Phase 21 growth events rather than page-view estimates.
- `/api/admin/analytics/export` provides a date-bounded CSV export of finance events for authorized Admin/Finance roles.

## Observability evidence

- `scheduled_job_runs` records the actual Cloudflare scheduler route, cron expression, scheduled/start/end timestamps, duration, HTTP status and success/failure result.
- The Worker records scheduled-job evidence after every mapped cron execution without changing the underlying job result if observability storage itself fails.
- `application_error_events` records sanitized unhandled application errors by SHA-256 fingerprint and avoids storing stack traces or authorization tokens.
- Unknown application errors are persisted before the shared API handler returns HTTP 500.
- Developer API request logs provide request counts, error counts, average latency and p95 latency.
- Scheduled-job history provides run/failure counts and average execution duration.
- Provider health remains sourced from the existing live-test credential records instead of a duplicate provider configuration store.

## Reconciliation and operational visibility

The analytics workspace checks current reconciliation gaps for:

- captured non-credit payments without a `PAYMENT_CAPTURED` finance event;
- completed refunds without a `PAYMENT_REFUNDED` finance event;
- failed inbound provider webhooks;
- dead Developer API webhook deliveries; and
- failed transactional message deliveries.

These counts are evidence/attention signals only; Phase 25 does not automatically mutate financial/provider state to make a dashboard look healthy.

## Daily snapshots

- `analytics_daily_snapshots` stores one JSON metrics snapshot per UTC day.
- Cloudflare schedule `31 2 * * *` calls `/api/cron/analytics-snapshot` to capture the previous UTC day.
- Snapshots are upserted by date, making a retry idempotent.
- The scheduler's own snapshot job is also recorded through the scheduled-job observability path.

## Cross-phase runtime correction

The final static review identified that Phase 19 custom-domain middleware treated `getsawa.internal` as an unknown customer hostname even though Cloudflare scheduled jobs dispatch through that internal host. `getsawa.internal` is now explicitly a platform host, preventing cron/internal observability calls from being rewritten into website rendering.

## Remaining deployment gates

No GitHub CI pass or local build pass is claimed. Production verification still requires the later Cloudflare staging phase to run all migrations, execute the OpenNext build, validate every cron route, confirm application-error persistence, confirm analytics snapshot generation, exercise finance export, and compare reconciliation counts against live provider/payment evidence.
