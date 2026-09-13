# Phase 22 Verification — Support, Notifications and Transactional Messaging

Phase 22 is implementation-complete at the repository gate.

Implemented contracts:

- durable `message_deliveries` ledger for in-app and transactional email events;
- idempotent event keys so retries do not create duplicate customer notifications;
- immediate SMTP attempt plus exponential retry state and a Cloudflare cron every six minutes;
- delivery status, attempt count, error reason and manual retry visibility for staff;
- repeated email failures create operational alerts and successful retries resolve them;
- order lifecycle notifications now use the durable delivery layer instead of fire-and-forget email;
- customer notification center with unread state and mark-all-read control;
- support first-response SLA state by ticket priority, customer/staff reply timestamps and automatic escalation;
- urgent tickets and customer replies create staff operational alerts;
- staff customer-facing support replies create retryable in-app/email delivery while internal notes remain private;
- assignment validation requires an active staff account;
- resolved/closed tickets clear support SLA/reply alerts;
- inbound provider `WebhookEvent` failures are surfaced as critical operational alerts;
- Messaging & Alerts admin workspace shows delivery history, manual retries, support SLA state, operational alerts and inbound provider webhook processing health;
- alert acknowledgement/resolution and delivery retries are audited.

Phase 22 does **not** add public/customer-configurable outbound webhook subscriptions; that belongs to Phase 23's developer integration platform. This phase monitors the provider webhooks GetSawa already receives and processes.

Deployment requires migration `20260913093000_messaging_delivery_support_ops`, a configured `CRON_SECRET`, the new `*/6 * * * *` Cloudflare cron trigger, and production SMTP credentials for email delivery. If SMTP is unavailable, messages remain visible in-app and email failures remain retryable/auditable rather than being reported as sent.

No CI/OpenNext build pass is claimed. Cloudflare staging remains the runtime gate.
