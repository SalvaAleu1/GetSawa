# Cloudflare staging and production environments

Phase 28 introduces explicit Wrangler environments so staging and production cannot accidentally share a Worker identity. Cloudflare's named-environment behavior creates `getsawa-staging` and `getsawa-production` from the root `getsawa` name. The root Worker has no route and `workers_dev` is disabled; do not deploy it.

## Environment topology

| Environment | Worker | Public endpoint in Phase 28 | Scheduled jobs |
| --- | --- | --- | --- |
| staging | `getsawa-staging` | `https://staging.getsawa.app` plus workers.dev | enabled only against isolated staging data |
| production | `getsawa-production` | workers.dev/preview verification only | disabled until Phase 29 cutover |
| root/default | `getsawa` | none | none |

`getsawa.app` remains on the previous production deployment until Phase 29. This is intentional: a Phase 28 production upload must not become a DNS cutover or create duplicate schedulers.

## Cloudflare account prerequisites

1. The `getsawa.app` zone must be active in the same Cloudflare account used for the Worker deployment.
2. The deploying identity must be authorized for Workers Scripts, the staging Custom Domain, logs/observability, and the product-specific Cloudflare zone operations already required by Phase 17/19.
3. Create a staging PostgreSQL database that is isolated from production. Do not point staging at the production `DATABASE_URL`.
4. Decide which live providers may safely be exercised from staging. Provider credentials that are absent must leave their dependent products fail-closed.
5. Configure build-time variables/secrets in Cloudflare Workers Builds if Cloudflare is building the repository. Configure runtime variables/secrets on the corresponding Worker as well; Next.js build-time and Worker runtime configuration are separate concerns.

## Core runtime secrets

Set these independently for `staging` and `production`; never copy a database/session secret between environments merely for convenience:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CRON_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Then configure the provider secrets needed for the products being verified: NameSilo, PayPal, SMTP, WHM, OpenSRS email, AI, storage and any other provider credentials from `.env.example`. Missing provider credentials are allowed only when the corresponding product remains unavailable/fail-closed.

Non-secret environment identity values are defined in `wrangler.jsonc`: `APP_ENV`, `APP_URL`, `APP_NAME`, `WEBSITE_PLATFORM_HOST` and `CLOUDFLARE_WORKER_SERVICE_NAME`.

## Staging deployment gate

The repository deployment wrapper requires the variables above plus this explicit isolation acknowledgement:

```bash
export APP_URL=https://staging.getsawa.app
export WEBSITE_PLATFORM_HOST=staging.getsawa.app
export CLOUDFLARE_WORKER_SERVICE_NAME=getsawa-staging
export CONFIRM_STAGING_ISOLATED=STAGING_IS_ISOLATED
export APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS
npm run deploy:cloudflare:staging
```

Do not put secret values into shell history. Prefer the Cloudflare dashboard/Workers Builds secret store or an approved secret manager/environment injection mechanism. The example above shows names and non-secret values only.

The deployment wrapper runs `prisma migrate status`, applies migrations only after the separate migration acknowledgement, builds with the `staging` Wrangler environment, deploys while preserving dashboard variables, then smoke-checks the staging hostname.

## Production upload in Phase 28

A production Worker may be built/uploaded for verification, but `wrangler.jsonc` deliberately has no production Custom Domain and no production cron triggers yet. Two explicit acknowledgements are required before the wrapper uploads it. Verify the resulting workers.dev/preview URL via `VERIFY_URL`.

Do not attach `getsawa.app` or enable the production cron list until the Phase 29 scheduler/DNS cutover procedure is executing.

## Logs and observability

Wrangler observability is enabled. Use:

```bash
./scripts/ops/cloudflare-tail.sh staging
./scripts/ops/cloudflare-tail.sh production
```

For deployment evidence record Worker name, deployment/version ID, commit SHA, migration result, staging hostname, HTTP smoke result and any runtime errors. Do not store secret values.

## Build-system note

OpenNext accepts Wrangler options such as `--env`; the repository uses the named environment during build and deploy. Dashboard-managed runtime variables are preserved with `--keep-vars`. If Workers Builds is used, configure the same environment selection in its build/deploy commands and ensure required build secrets exist in that build environment.
