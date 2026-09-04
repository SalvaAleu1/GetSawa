# GetSawa — Phase 2

Phase 2 hardening is active. The repository is being expanded without mock provider behavior or client-only business logic.

## Eight workstreams

1. **Production hosting** — provider contract is present and product activation fails closed until a real vendor API and credentials are configured. No simulated accounts are created.
2. **Business email** — provider contract is present and activation fails closed until a real mailbox provider is configured. Transactional SMTP remains separate from customer mailbox hosting.
3. **Provisioning lifecycle** — domain, auction and existing provisioning jobs use server-side state and idempotent operations; provider errors are persisted rather than silently swallowed.
4. **Customer service dashboards** — domains, orders, websites, support, referrals and developer APIs remain first-class database-backed services.
5. **Billing and renewal lifecycle** — PayPal payment state, invoices, refunds, commissions and scheduled renewal processing are persisted and reconciled server-side.
6. **Monitoring and failure handling** — cron jobs, provider configuration, database health and deployment version are exposed through the operational health endpoint without revealing secrets.
7. **Security and access control** — TOTP MFA enrollment/verification is implemented; login enforces MFA for enrolled users; administrators can require MFA globally; session revocation and audit events are available.
8. **Integration verification** — MFA behavior has automated tests; quality gates remain the required final build/typecheck/test authority before release.

## Provider policy

GetSawa will not pretend to provision hosting or business email. A real vendor must be selected and its API contract mapped into the existing provider interfaces before those products can become active. This is intentionally a deployment/business dependency rather than fabricated code.

## Operational acceptance

A feature is complete only when UI, API route, business logic, database persistence, provider adapter, failure path and tests agree. A button that merely changes local state does not count.

## Current checkpoint

- Phase 1: **closed at implementation level**.
- Phase 2: **active**.
- Scheduled auction settlement: **implemented**.
- TOTP MFA and session revocation: **implemented**.
- Health/provider readiness reporting: **implemented**.
- Real hosting/email vendor provisioning: **blocked only by vendor selection/account credentials**, not by a missing mock implementation.
