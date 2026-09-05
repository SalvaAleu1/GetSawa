# GetSawa Phase 3D — Refunds, Disputes & Finance Operations

## Delivered

- Production PayPal capture-refund provider operation.
- Finance/admin payment console showing payment status and refundable balance.
- Full and partial refunds with server-side remaining-balance enforcement.
- Confirmed refunds persist in the `Refund` ledger with PayPal refund IDs.
- Full refunds move the payment and order to `REFUNDED` and the invoice to `REFUNDED`.
- Partial refunds move the payment to `PARTIALLY_REFUNDED` without falsely closing the order.
- Finance/admin authorization is required for refund operations.
- Refund actions are audit logged.
- PayPal-confirmed payment disputes are represented as `DISPUTED` instead of being silently treated as successful.

## Production safety

The refund endpoint calls PayPal's live API through the existing provider boundary. It never fabricates a refund. GetSawa only records a completed refund after PayPal returns a completed refund with a provider refund ID.

Refund amounts are checked against the captured payment and previously completed refunds. Provider credentials must be configured before a live refund can be executed.

## Operational route

- Finance console: `/admin/payments`
- Payment list API: `GET /api/admin/payments`
- Refund API: `POST /api/admin/payments/:id/refund`
- Reconciliation API: `POST /api/admin/payments/reconcile`

## Launch checks

Before public launch, run a real low-value payment and refund using live PayPal credentials, verify the PayPal refund webhook updates the same payment, test a partial then final refund, and verify disputes are visible to finance users.

The provider remains the source of truth for payment/refund execution; GetSawa's database is the operational ledger and audit record.
