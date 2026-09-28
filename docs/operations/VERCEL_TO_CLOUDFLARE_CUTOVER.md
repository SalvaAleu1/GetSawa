# CloudSawa public-domain cutover

This retained filename is historical. CloudSawa currently has no owned public production domain to migrate from Vercel. The actual launch operation is a workers.dev-to-`cloudsawa.com` Cloudflare cutover after the domain is purchased.

## Before domain purchase

1. Deploy and verify `cloudsawa-staging` on an isolated workers.dev endpoint.
2. Deploy and verify the root `cloudsawa` Worker on its workers.dev endpoint.
3. Keep the root Worker in preview mode with no custom-domain route and no production scheduler.
4. Verify database migrations, backup/restore, NameSilo, PayPal, SMTP and Cloudflare readiness.
5. Record the approved release commit and the Cloudflare deployment/version ID.

## Preconditions for public launch

All are mandatory:

1. `cloudsawa.com` has actually been purchased and is under company control.
2. The domain is active in the intended Cloudflare account.
3. The pre-domain Worker and database tests passed.
4. The production database migration state is reviewed and current.
5. NameSilo, PayPal, SMTP and Cloudflare have passed launch-provider acceptance.
6. A real database backup and isolated restore drill has passed.
7. Final support, legal, security and monitoring launch gates are approved.
8. The last-known-good Cloudflare workers.dev deployment/version is recorded for rollback.

## Domain activation

From the exact approved release commit:

```bash
export CONFIRM_CLOUDSAWA_DOMAIN_OWNED=cloudsawa.com
npm run ops:activate-domain
```

Review the resulting `wrangler.jsonc` change. It must bind only `cloudsawa.com`, set the root Worker to production, disable workers.dev and enable the consolidated scheduler.

Set the final public values:

```bash
export APP_URL=https://cloudsawa.com
export WEBSITE_PLATFORM_HOST=cloudsawa.com
export CLOUDFLARE_WORKER_SERVICE_NAME=cloudsawa
export CONFIRM_PRODUCTION_DEPLOY=DEPLOY_CLOUDSAWA_PRODUCTION
export CONFIRM_PRODUCTION_WORKER_UPLOAD=UPLOAD_PRODUCTION_WORKER
export CONFIRM_PRODUCTION_CUTOVER=SWITCH_CLOUDSAWA_TO_CLOUDFLARE
export APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS
npm run deploy:cloudflare:production
```

Never paste provider/database secret values into shell history.

## Final verification

1. Verify TLS, root, login, domain search, products, support, robots, sitemap and manifest.
2. Confirm response headers identify the CloudSawa Cloudflare Worker and production environment.
3. Configure/verify the PayPal webhook at `https://cloudsawa.com/api/webhooks/paypal`.
4. Confirm SMTP uses an authorized CloudSawa sender identity.
5. Run payment reconciliation, domain sync and provisioning recovery.
6. Observe scheduled Cloudflare execution and persisted job outcomes.
7. Complete one controlled approved live domain transaction and reconcile it before any retry.
8. Complete the launch-evidence gate from the exact release commit.

## Rollback

If the custom-domain launch fails:

1. Freeze customer mutations that could duplicate external side effects.
2. Disable the production scheduler before changing routing.
3. Restore the last-known-good Cloudflare deployment/version.
4. If needed, remove the custom-domain route and temporarily re-enable workers.dev for operator verification.
5. Reconcile payments, domains and provisioning. Code/routing rollback does not undo provider side effects.
6. Preserve logs and resolve the failure before another launch attempt.

Exactly one production scheduler authority must be active.
