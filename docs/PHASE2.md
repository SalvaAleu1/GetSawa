# GetSawa — Phase 2

Phase 1 is now closed at the code level: the critical customer path is backed
by real server-side business logic, provider adapters, PostgreSQL persistence,
security controls, payment idempotency, provisioning recovery, admin controls,
and substantive legal-policy pages.

Phase 2 builds on that foundation rather than creating parallel or mock
systems.

## Phase 2 objectives

### 1. Production operations

- Keep domain state synchronized with the registrar.
- Send renewal reminders through the configured transactional-email transport.
- Automatically settle expired auctions instead of relying only on page views.
- Preserve idempotency and safe retry behavior for every scheduled operation.
- Keep provider failures visible to administrators and customers.

The auction-close job is now scheduled every five minutes through `vercel.json`
and protected by `CRON_SECRET`.

### 2. Customer platform expansion

Already present in the repository and treated as first-class platform services:

- Domain transfers with encrypted EPP/auth codes.
- AI website generation, editing, version history and publishing.
- Domain-to-website connection through a real DNS record.
- Premium-domain marketplace and auctions.
- Support tickets and internal admin notes.
- Affiliate/referral tracking and PayPal payouts.
- Scoped developer API keys and authenticated domain APIs.
- Public blog/CMS and database-backed SEO pages.

### 3. Provider-backed digital services

The next provider work must be real, not simulated:

- Select and integrate a production hosting vendor through `HostingProvider`.
- Select and integrate a production business-email vendor through `EmailProvider`.
- Add provider health checks, provisioning, suspension, renewal and failure
  recovery for each vendor.
- Do not allow a product to become active unless its provider dependency is
  configured and tested.

### 4. Security and scale hardening

The Phase 2 security track will progressively add:

- Stronger multi-factor authentication for privileged accounts.
- Distributed rate limiting suitable for multiple application instances.
- More granular administrative permissions and audit visibility.
- Strict validation for future file uploads and support attachments.
- Operational monitoring for failed payments, provisioning failures and cron
  failures.

## Acceptance rule

A feature is complete only when the UI, API route, business logic, database
model, provider adapter, failure path and tests agree. A button that merely
changes local state does not count as implementation.

## Current checkpoint

- Phase 1: **closed at the implementation level**.
- Phase 2: **started**.
- Phase 2 first hardening item: **scheduled auction settlement implemented**.
- Live vendor credentials, registrar/payment configuration and legal counsel
  review remain deployment/business configuration tasks rather than fake code
  to be embedded in the repository.
