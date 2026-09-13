# Secondary provider onboarding checklist

A provider cannot enter routing merely because credentials exist.

1. Commercial/merchant/reseller account approved for GetSawa's real operating entity/jurisdiction.
2. Provider terms, pricing, settlement and limits reviewed.
3. Adapter implements the existing capability contract without bypassing server-authoritative pricing or authorization.
4. Credentials stored per environment with minimum permissions; no shared staging/production secret.
5. Read-only health/authentication test passes.
6. Controlled create/update operation passes where required.
7. Timeout/5xx/rate-limit/auth failure behavior tested.
8. Idempotency and duplicate-side-effect protection proven.
9. Provider IDs are persisted for reconciliation.
10. Reconciliation/recovery path works independently of UI state.
11. Refund/cancel/reversal or compensating path defined where applicable.
12. Monitoring/alerts identify provider-specific degradation.
13. Runbook and escalation contact recorded.
14. Phase 30-style acceptance evidence reviewed by a second operator.
15. Only then add the adapter name to the implemented-provider catalog and configure it as primary/secondary.

Automatic failover requires a separate risk review because safe manual switching does not prove safe automatic switching.
