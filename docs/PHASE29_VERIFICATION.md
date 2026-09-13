# Phase 29 verification — Vercel to Cloudflare cutover

Status: cutover configuration and verification tooling are repository-complete; the live scheduler/DNS/traffic handoff remains blocked on successful Phase 27/28 live gates and verified access to the actual legacy Vercel project.

## Repository implementation

- Production Wrangler environment now declares `getsawa.app` as a Cloudflare Worker Custom Domain.
- Production Cloudflare schedules contain all 12 Worker cron mappings.
- Production deploy requires a third explicit cutover acknowledgement in addition to the existing production deployment/upload acknowledgements.
- Cloudflare responses carry non-secret `x-getsawa-runtime` and `x-getsawa-environment` fingerprints so traffic origin can be proven after cutover.
- A zero-dependency Node configuration checker validates Vercel cron coverage, Cloudflare cron/mapping equality, Custom Domain ownership and production workers.dev shutdown.
- Production verification checks the Cloudflare runtime fingerprint, public health and PayPal webhook configuration without creating a payment.
- Detailed cutover, scheduler handoff and rollback sequence is documented.

## Static gate

Before merge:

1. Run `node scripts/ops/check-cutover-config.mjs` and require success.
2. Run `bash -n` on `deploy-cloudflare.sh` and `verify-production-cutover.sh`.
3. Parse `wrangler.jsonc` and ensure production has exactly one apex Custom Domain, `workers_dev=false` and 12 unique crons.
4. Review that `vercel.json` remains unchanged; disabling the live legacy scheduler must be an explicit operational action during the change window, not an early source-code side effect.

## Live gate

Phase 29 is not DONE until evidence shows:

- the verified Vercel production scheduler was disabled at the handoff timestamp;
- the Cloudflare production deployment attached `getsawa.app` and served valid TLS;
- `verify-production-cutover.sh` passed against the public hostname;
- PayPal webhook handling remained configured and provider events were verified;
- Cloudflare scheduled jobs ran successfully without duplicate Vercel executions;
- payment/domain/provisioning reconciliation had no unexplained divergences;
- the rollback target remained available through the validation window.

The connected Vercel tool returned no team/project and the repository has no `.vercel/project.json`, so the actual Vercel shutdown was intentionally not guessed or performed in this session.
