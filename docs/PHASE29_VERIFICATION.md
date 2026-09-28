# Phase 29 verification — CloudSawa public-domain activation

Status: repository cutover tooling is complete; the live public-domain activation remains intentionally blocked until `cloudsawa.com` is purchased and the pre-domain runtime/provider gates pass.

## Repository implementation

- `scripts/ops/activate-custom-domain.mjs` refuses activation unless `CONFIRM_CLOUDSAWA_DOMAIN_OWNED=cloudsawa.com` is explicitly supplied.
- Final activation binds `cloudsawa.com` to the root `cloudsawa` Worker, disables workers.dev, sets `APP_ENV=production`, and enables one minute-level Cloudflare trigger.
- The Worker internally dispatches the 12 CloudSawa scheduled jobs.
- Cloudflare responses carry non-secret `x-cloudsawa-runtime` and `x-cloudsawa-environment` fingerprints.
- Production verification checks TLS/public health/runtime identity and PayPal webhook configuration without creating a payment.
- Rollback and reconciliation steps remain documented.

## Static gate — 28 September 2026

- Pre-domain configuration passes `node scripts/ops/check-cutover-config.mjs`.
- `wrangler.jsonc` contains no custom domain before ownership is confirmed.
- Production-domain activation is a separate explicit command, not a side effect of ordinary pushes.
- The deployment wrapper uses `CLOUDFLARE_WORKER_SERVICE_NAME=cloudsawa` for the root Worker.
- The CloudSawa quality gate passed on the current rebrand commit.

## Live gate

Phase 29 is not DONE until evidence shows:

1. `cloudsawa.com` was actually purchased and is controlled by the company.
2. The domain was added to the correct Cloudflare account.
3. Pre-domain Cloudflare runtime, database, provider and restore gates already passed.
4. `CONFIRM_CLOUDSAWA_DOMAIN_OWNED=cloudsawa.com npm run ops:activate-domain` was run from the exact approved release commit.
5. Final runtime variables use `APP_URL=https://cloudsawa.com` and `WEBSITE_PLATFORM_HOST=cloudsawa.com`.
6. The Worker served valid TLS and the CloudSawa runtime fingerprints at the public hostname.
7. PayPal webhook configuration points to the final public endpoint and signature verification succeeds.
8. Cloudflare scheduled jobs run successfully without duplicate scheduler execution.
9. Payment/domain/provisioning reconciliation has no unexplained divergence.
10. A rollback deployment/version remains recorded through the launch validation window.
