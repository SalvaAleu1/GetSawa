# GetSawa Phase 3C — Payment Reliability & Reconciliation

## Delivered

- PayPal pending-payment reconciliation against PayPal's authoritative order API.
- Amount and currency verification before a reconciled payment can become `PAID`.
- Automatic recovery when a browser return or webhook is lost.
- Failed/voided PayPal orders are recorded as failed instead of remaining indefinitely pending.
- Reconciled successful payments enter the same order lifecycle and provisioning path as synchronous checkout/webhook payments.
- Renewal payments are connected to the billing lifecycle only after normal order fulfilment reaches `ACTIVE`.
- Per-event idempotency remains enforced by the existing PayPal webhook event ledger.
- Authenticated scheduled reconciliation every 15 minutes.
- Finance/admin manual reconciliation endpoint with audit logging.
- Provider/network errors are isolated per payment so one failure does not stop the batch.

## Production safety

The reconciliation worker never creates a charge and never trusts client-side payment state. It only reads the PayPal order state, validates the amount/currency against GetSawa's recorded `Payment`, and then uses the existing provisioning lifecycle.

A mismatch is marked `DISPUTED` for investigation rather than being treated as paid. PayPal credentials must be configured before reconciliation can run.

## Operational endpoints

- Scheduled worker: `/api/cron/payment-reconciliation` — requires `Authorization: Bearer <CRON_SECRET>`.
- Finance/admin manual run: `POST /api/admin/payments/reconcile` — requires `SUPER_ADMIN`, `ADMIN`, or `FINANCE`.

## Schedule

Vercel runs payment reconciliation every 15 minutes. The worker considers recent PayPal payments (up to 48 hours old) in `PENDING` or `AUTHORIZED` state and processes up to 50 per run.

## Next production checks

Before public launch, configure live PayPal credentials and webhook ID, run a real low-value transaction, confirm the synchronous capture, webhook, and reconciliation paths all converge on one `Payment`/`Order`, and verify the production database has the Phase 3B billing migration applied.
