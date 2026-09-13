# Phase 28 verification — Cloudflare staging and production infrastructure

Status: repository infrastructure configuration complete; creation/deployment of the actual Cloudflare environments is an external runtime gate.

## Repository implementation

- Explicit `staging` and `production` Wrangler environments.
- Non-routable/default root Worker to reduce accidental deployment risk.
- Staging Custom Domain `staging.getsawa.app`, isolated environment identity and full scheduled-job configuration.
- Production Worker identity prepared without production route or crons so Phase 28 cannot accidentally cut over traffic or duplicate the current Vercel scheduler.
- Environment-aware OpenNext build/preview/type generation/deployment scripts.
- Deployment preflight enforcing core secrets, exact environment identity, Cloudflare authentication and explicit staging/production acknowledgements.
- Migration status gate plus separately acknowledged `prisma migrate deploy`.
- Deployment smoke and live-log helpers.
- Environment/secrets, cron and evidence runbooks.

## Static verification required before merge

- Parse `wrangler.jsonc` as JSONC-compatible JSON (the committed file contains no comments/trailing commas).
- Parse `package.json` as JSON.
- Run `bash -n` over the Phase 28 shell scripts.
- Confirm the 12 staging cron expressions exactly match the 12 mappings in `cloudflare-worker.ts`.

## Live Cloudflare gate

Phase 28 cannot be called fully verified until all of the following have evidence:

1. `getsawa-staging` is deployed and reachable at `https://staging.getsawa.app` with valid Cloudflare TLS.
2. Staging uses its own database and session/cron secrets; required migrations completed successfully.
3. Representative login, domain search, cart, checkout-safe path, dashboard and admin pages run in the Workers runtime.
4. Staging cron invocations reach the correct routes and persist job outcomes; no unintended provider side effects occur.
5. Worker observability/logs capture requests and errors without exposing secrets.
6. `getsawa-production` is uploaded and verified on a non-production endpoint without changing `getsawa.app` traffic or enabling its crons.
7. Phase 26 Lighthouse/accessibility/PWA checks are executed against staging.
8. Deployment/version IDs and rollback target are recorded.

This session has repository/GitHub access but no Cloudflare account/deployment connector or Cloudflare secret values, so claiming those runtime steps are complete would be false. The committed controls make the live gate explicit and safe to execute.
