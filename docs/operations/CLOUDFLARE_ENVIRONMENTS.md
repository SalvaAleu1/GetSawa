# Cloudflare pre-domain and launch environments

CloudSawa now uses a deliberately simple pre-domain topology. Until `cloudsawa.com` is actually purchased and added to the Cloudflare account, both the root Worker and staging remain on `workers.dev`. No custom domain is assumed and no production scheduler is enabled.

## Environment topology

| Environment | Worker | Public endpoint before domain purchase | Scheduled jobs |
| --- | --- | --- | --- |
| staging | `cloudsawa-staging` | Cloudflare-assigned workers.dev URL | disabled unless explicitly enabled for isolated test data |
| pre-domain production candidate | `cloudsawa` | Cloudflare-assigned workers.dev URL | disabled |
| public production after domain purchase | `cloudsawa` | `https://cloudsawa.com` | one minute-level Cloudflare trigger; Worker dispatches the 12 internal schedules |

The executable source of truth is `wrangler.jsonc`, `scripts/ops/deploy-cloudflare.sh`, `scripts/ops/cloudflare-preflight.sh` and `scripts/ops/activate-custom-domain.mjs`.

## Cloudflare account prerequisites

1. Before domain purchase, a Cloudflare account with Workers access is sufficient for the workers.dev deployment.
2. Staging must use an isolated PostgreSQL database and isolated session/cron secrets.
3. The pre-domain `cloudsawa` Worker may use the intended production database only after migrations and launch-scope provider configuration have been reviewed.
4. Configure build-time variables/secrets in Cloudflare Workers Builds and runtime Worker secrets separately.
5. Missing provider credentials must keep their dependent products unavailable/fail-closed.

## Core deployment values

For staging:
- `APP_NAME=CloudSawa`
- `CLOUDFLARE_WORKER_SERVICE_NAME=cloudsawa-staging`

For the pre-domain production candidate:
- `APP_NAME=CloudSawa`
- `CLOUDFLARE_WORKER_SERVICE_NAME=cloudsawa`

During workers.dev testing, `APP_URL` and `WEBSITE_PLATFORM_HOST` are intentionally not hard-coded before the first deployment because Cloudflare assigns the exact hostname.

## Pre-domain deployment

Cloudflare Workers Builds may run:

```bash
WORKERS_CI=1 npm run deploy:cloudflare:production
```

The deployment wrapper verifies the repository, prepares the database, seeds only the safe baseline, synchronizes the core runtime secrets available to the build, builds OpenNext and uploads the `cloudsawa` Worker.

A successful pre-domain upload must leave:
- `workers_dev=true`
- no `routes`
- no production cron trigger
- `APP_ENV=preview`

Record the exact workers.dev hostname and use it for runtime verification.

## Final domain activation

Only after `cloudsawa.com` has actually been purchased and added to the Cloudflare account:

```bash
CONFIRM_CLOUDSAWA_DOMAIN_OWNED=cloudsawa.com npm run ops:activate-domain
```

That controlled mutation changes the root Worker to public production by binding `cloudsawa.com`, disabling workers.dev, setting `APP_ENV=production` and enabling the consolidated minute-level scheduler.

Then set `APP_URL=https://cloudsawa.com`, `WEBSITE_PLATFORM_HOST=cloudsawa.com`, configure final provider webhooks/mail identity, deploy, and run the production cutover verifier.

## Evidence

For each deployment record the Worker name, deployment/version ID, commit SHA, migration result, public workers.dev/custom-domain hostname, HTTP smoke result and any runtime errors. Never store secret values in evidence.
