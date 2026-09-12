# Phase 14 Verification — Payments, Billing, Invoices, Refunds and Credits

Phase 14 is implementation-complete and ready for the Cloudflare build/deployment gate.

## Implemented contracts

- PayPal capture is verified against the recorded payment-attempt amount and currency before fulfilment.
- Browser capture, PayPal webhook delivery and reconciliation converge through idempotent finance events.
- Provider fees are recorded when PayPal supplies authoritative fee data.
- Paid invoices converge to `PAID`; full refunds converge payment, order and invoice state to `REFUNDED`.
- Refunds performed directly in PayPal are imported through verified webhooks instead of drifting outside GetSawa.
- Disputes are recorded as financial events without being treated as completed refunds.
- Domain renewal invoices are priced from a fresh registrar wholesale quote protected by GetSawa's pricing safety policy.
- Renewal payment attempts refresh pricing again before PayPal handoff.
- Failed renewal payments remain retryable while ordinary failed checkouts release reserved inventory and account credit.
- GetSawa account credit has serialized balance controls, checkout reservations, partial-payment support, full-credit checkout and refund restoration.
- Credit cannot be double-spent by concurrent checkout/admin adjustments.
- Finance/admin reporting exposes captures, refunds, provider fees, disputes, renewal state and customer-credit liabilities.
- The customer billing surface reports invoices, renewal attempts, spendable credit and truthful payment-method availability.
- A separate direct-card gateway remains disabled until an actual production provider is configured.

## Verification performed

- Reviewed the Phase 14 branch against the payment, order, invoice, renewal, credit, refund, reconciliation and provider contracts.
- Reviewed all Phase 14 migrations for ordering, constraints and foreign-key targets.
- Confirmed the branch is a clean descendant of `main` with no branch divergence before promotion.
- Corrected the central order lifecycle to permit the legitimate `PENDING_PAYMENT -> FAILED` transition.
- Corrected renewal quote-age handling so the payment-attempt timestamp, not an advance invoice timestamp, governs short-lived domain payment quotes.
- Corrected financial idempotency so browser, webhook and reconciliation callbacks cannot multiply ledger revenue.

## Build evidence limitation

GitHub reported no CI/status checks for the branch head, and the available local execution environment could not resolve GitHub to clone the repository for `npm run typecheck` / `npm run build`. This is not recorded as a passing build. Per the master roadmap, GitHub Actions are not a completion prerequisite while the Actions allowance is unavailable; the authoritative runtime build remains the Cloudflare staging/build gate in Phase 28.
