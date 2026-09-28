# Phase 28 verification — Cloudflare pre-domain infrastructure

Status: repository infrastructure configuration complete; live Cloudflare deployment remains an external runtime gate.

## Repository implementation

- Staging Worker identity: `cloudsawa-staging`.
- Pre-domain production-candidate Worker identity: `cloudsawa`.
- Both remain on Cloudflare-assigned `workers.dev` endpoints before the company domain is purchased.
- No production custom domain or production scheduler is enabled before domain ownership.
- Environment-aware OpenNext build/deployment scripts.
- Deployment preflight enforcing database and Cloudflare requirements without requiring a not-yet-known workers.dev hostname.
- Safe/idempotent baseline seed.
- Worker runtime secret synchronization for database/session/cron values when available in Workers Builds.
- Deployment health and live-log helpers.

## Static verification — 28 September 2026

- `wrangler.jsonc` identifies the root Worker as `cloudsawa` and staging as `cloudsawa-staging`.
- Root and staging keep `workers_dev=true` before domain purchase.
- No custom-domain route is present before explicit domain activation.
- No production cron trigger is present before explicit domain activation.
- `scripts/ops/check-cutover-config.mjs` validates the pre-domain configuration.
- The CloudSawa GitHub quality gate passed on the current rebrand commit.

## Live Cloudflare gate

Phase 28 is fully verified only when evidence shows:

1. `cloudsawa-staging` is deployed to an isolated workers.dev endpoint and isolated database.
2. The root `cloudsawa` Worker is deployed to a workers.dev endpoint without binding `cloudsawa.com`.
3. Required migrations and safe baseline seed completed successfully.
4. Representative login, domain search, cart, checkout-safe path, dashboard and admin pages run in the Workers runtime.
5. Worker observability/logs capture requests and errors without exposing secrets.
6. Phase 26 Lighthouse/accessibility/PWA checks are executed against an appropriate Cloudflare endpoint.
7. Deployment/version IDs and rollback targets are recorded.

Domain purchase is not a Phase 28 prerequisite.
