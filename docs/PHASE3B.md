# GetSawa Phase 3B — Billing & Renewals

## Delivered

- Persistent billing subscription records for recurring services.
- Persistent renewal-attempt records with unique subscription/period idempotency.
- Automatic synchronization of active/expiring domains into the billing lifecycle.
- Domain auto-renew controls in the customer dashboard.
- Renewal orders and unpaid invoices generated before domain expiry.
- Secure PayPal payment initiation for renewal invoices.
- Renewal payment success/failure wired into the existing order, invoice, payment and provisioning lifecycle.
- Billing status, renewal queue and payment exception visibility for finance/admin users.
- Hourly authenticated billing-renewal cron job.
- Audit events and customer notifications around renewal creation.

## Production behavior

The application never fabricates a successful renewal or payment. PayPal must be configured before a renewal invoice can be paid. The renewal scheduler creates a real GetSawa renewal order and invoice; it does not claim that a card or PayPal account was charged when no authorized recurring-payment instrument exists.

PayPal's current Subscriptions API uses products, plans and subscriber-approved subscriptions. Access to the current partner integration is subject to PayPal onboarding/eligibility. Once GetSawa has the required PayPal subscription access and production credentials, the stored `provider_subscription_id` field can be populated and subscription webhook events can be connected to the same billing lifecycle without changing the customer-facing renewal model.

## Database deployment

The Phase 3B migration is:

`prisma/migrations/20260905060000_billing_lifecycle/migration.sql`

Production deployment must run `prisma migrate deploy` against the intended PostgreSQL database before billing endpoints are enabled. Never run destructive schema resets against production.

## Required production environment

- `DATABASE_URL`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_MODE=live` (or omit `PAYPAL_MODE` and use the production default)
- `PAYPAL_WEBHOOK_ID`
- `APP_URL`
- `CRON_SECRET`

## Renewal policy

- Billing is scheduled seven days before the registrar expiry date.
- If renewal payment is not completed, the subscription is marked `PAST_DUE` and a seven-day grace period is recorded.
- The registrar remains authoritative for the actual domain expiry date.
- A successful paid renewal is only marked complete after the normal order provisioning workflow succeeds.
- Duplicate renewal orders are prevented by a subscription-period idempotency key.
