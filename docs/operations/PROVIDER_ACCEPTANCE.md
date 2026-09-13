# Production provider acceptance matrix

A provider is launch-enabled only after its production credentials, permissions, successful live/read-only or controlled acceptance test, failure behavior and reconciliation path are proven. Environment-variable presence alone is not acceptance.

| Provider / capability | Required before launch when enabled | Failure rule | Recovery / reconciliation |
| --- | --- | --- | --- |
| NameSilo registrar | production account/API authentication; live availability + pricing quote; one approved registration/renewal/transfer scenario as applicable; premium-price safety | domain checkout/action fails closed when authoritative quote/provider state is unavailable | domain sync + registrar references before retry |
| PayPal payments/cards | live OAuth; order creation/approval/capture controlled transaction; webhook signature verification; refund/reconciliation evidence | never assume timeout means capture failed; no blind second capture | payment reconciliation and provider transaction IDs |
| Cloudflare DNS/security/publishing | least-privilege production token; zone/DNS operations required by enabled product; Worker deployment/runtime; Custom Domain tests | do not mark DNS/security/site active on local DB state alone | provider state + provisioning recovery |
| SMTP transactional mail | authenticated delivery to controlled inbox; sender/DNS alignment where required; bounce/error handling reviewed | core financial/provider state must not depend on email delivery success | durable message ledger/retry job |
| WHM hosting | required only if hosting is marketed/sold; account/package create/read/suspend lifecycle tested | hosting checkout stays unavailable if provider readiness fails | provisioning recovery + WHM account identity |
| OpenSRS Hosted Email | required only if business email is marketed/sold; auth/domain/mailbox lifecycle tested | email checkout stays unavailable if provider readiness fails | provisioning recovery + provider domain/mailbox identity |
| AI provider | required only if AI builder is publicly enabled; auth/model/generation limits and error behavior tested | builder must report provider unavailability; never fabricate generation | retry only idempotent generation operations where safe |
| Object storage | required before upload-dependent/publishing features rely on it; upload/read/delete lifecycle tested | upload-dependent feature remains unavailable | storage object identity + application records |

## Acceptance evidence

For every enabled provider record: environment (`staging`/`production`), provider account identifier safe to record, date/time, operator/reviewer, tested operation, provider request/reference identifiers, expected result, actual result, failure-mode test, reconciliation result and any restrictions. Never record credentials.

## Financial and registrar safety

A single HTTP timeout must never trigger an unverified second payment capture or domain registration/renewal. First reconcile using the existing payment/domain recovery flows. Premium registry prices must be treated as authoritative and re-quoted when stale; GetSawa markup cannot replace or cap an unknown wholesale price.
