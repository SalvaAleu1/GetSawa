# Provider resilience and expansion

Phase 31 closes the roadmap by making provider expansion explicit and fail-closed. It does **not** pretend that a secondary registrar, payment gateway or regional provider is live before a commercial account, real adapter and production acceptance evidence exist.

## Current implemented adapters

- Domains: NameSilo
- Payments/cards through PayPal checkout: PayPal
- Hosting: WHM/cPanel
- Business email: OpenSRS Hosted Email
- DNS/security and publishing: Cloudflare
- AI builder: Anthropic adapter

Each capability has one implemented provider today, so automatic cross-provider failover is intentionally ineligible. Provider-side retries/reconciliation within the same provider remain handled by the existing recovery flows.

## Selection contract

`src/lib/providers/provider-routing.ts` centralizes primary/secondary selection and refuses an unknown provider name. Setting a secondary provider before its adapter exists is a configuration error, not a signal to mock/fallback. `PROVIDER_AUTOMATIC_FAILOVER_CAPABILITIES` is a comma-separated capability allow-list such as `payments` or `domains,payments`; each selected capability additionally requires two distinct implemented providers and a reviewed `PROVIDER_FAILOVER_APPROVAL_ID`.

This protects unrelated capabilities from being affected when failover is introduced for one product area. It also protects high-risk operations from unsafe generic failover. A timeout during payment capture, domain registration, renewal, transfer, provisioning or payout must be reconciled with provider truth before another provider is attempted.

## Adding a secondary registrar

A registrar is eligible only after it implements the complete `DomainProvider` contract needed by the product scope, including authoritative standard/premium availability and pricing, registration/renewal/transfer, domain state, nameservers/DNS, locks, auto-renew and privacy/DNSSEC where advertised. Premium-domain support must return exact authoritative premium pricing; an unknown premium wholesale cost must remain non-purchasable.

Before routing real traffic: map TLD capability differences, normalize provider error/status states, prove idempotency/reconciliation, test transfer/renewal lifecycle, verify pricing currency/fees, and complete the Phase 30 provider acceptance evidence.

## Adding a regional/local payment provider

Do not integrate a provider solely because it advertises card/mobile-money support in another country. Production eligibility requires merchant onboarding for GetSawa's actual business/account jurisdiction, supported settlement route/currency, refund/dispute/webhook capability, API access, idempotency, reconciliation and a controlled production transaction.

A second payment adapter should implement the shared `PaymentProvider` contract and keep provider transaction IDs. Automatic payment failover must never retry an ambiguous capture on another gateway until the original provider state is known.

## Failover modes

1. **Off (default):** current production behavior; `PROVIDER_AUTOMATIC_FAILOVER_CAPABILITIES` is blank and existing provider fail-closed/recovery rules apply.
2. **Manual provider switch:** allowed only after the secondary adapter and acceptance evidence exist. Freeze affected mutations, reconcile the primary, switch configuration, then verify controlled operations.
3. **Automatic failover:** future capability only and enabled per named capability. Requires two implemented adapters, explicit approval, operation-level idempotency semantics and proof that ambiguous external side effects cannot duplicate money/domain actions.

## Scaling and automation

Prefer queue/backpressure controls and idempotent reconciliation before adding provider fan-out. Track provider latency/error rate separately from application errors. Scale scheduled jobs so overlapping runs cannot double-process finance/domain/provisioning work. Any regional topology must preserve a single authoritative commerce database/write strategy unless a reviewed multi-writer design replaces it.
