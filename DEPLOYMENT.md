# GetSawa deployment — Cloudflare Workers

GetSawa targets Cloudflare Workers through `@opennextjs/cloudflare`. The production Wrangler environment is `production`, which deploys the Worker as `getsawa-production` and attaches the custom domain `getsawa.app`. Staging uses `getsawa-staging` and `staging.getsawa.app`.

GitHub Actions are not required for deployment. Cloudflare Workers Builds can connect directly to the GitHub repository and build/deploy `main` inside Cloudflare.

## 1. Production prerequisites

Before production cutover, ensure:

- `getsawa.app` is in the Cloudflare account that will own the Worker custom domain.
- The production PostgreSQL database is reachable from Cloudflare Workers.
- Reviewed Prisma migrations are ready.
- Production provider credentials are available for the products being launched.
- The current repository `main` is the approved release commit.

## 2. Create the Wrangler environment Worker

GetSawa uses Wrangler environments. Create the environment Worker before connecting Git Builds:

- Staging Worker: `getsawa-staging`
- Production Worker: `getsawa-production`

A temporary starter/Hello World Worker is sufficient; the first successful GetSawa deployment replaces its code. Configure runtime variables/secrets on that Worker before the repository deployment so `--keep-vars` preserves them.

## 3. Connect the GitHub repository through Workers Builds

In the selected Worker:

1. Open **Settings → Builds → Connect**.
2. Connect GitHub and authorize repository `SalvaAleu1/GetSawa`.
3. Use branch `main`.
4. Keep the repository root as `/`.
5. Leave **Build command** empty. The guarded GetSawa deployment script performs the OpenNext build itself.
6. Use the matching deploy command:

### Staging deploy command

```bash
npm run deploy:cloudflare:staging
```

### Production deploy command

```bash
npm run deploy:cloudflare:production
```

These scripts run Cloudflare preflight, Prisma generation/migration status, the OpenNext build, explicit deployment acknowledgements, Worker upload and post-deploy verification. The `production` Wrangler environment resolves to Worker `getsawa-production`; staging resolves to `getsawa-staging`.

## 4. Build variables and secrets

Workers Builds **build variables/secrets** exist only during the deployment job. The guarded deployment script needs the following for the selected environment.

### Production build variables

```text
NODE_ENV=production
APP_URL=https://getsawa.app
APP_NAME=GetSawa
WEBSITE_PLATFORM_HOST=getsawa.app
CLOUDFLARE_WORKER_SERVICE_NAME=getsawa-production
CLOUDFLARE_ACCOUNT_ID=<your account id>
CONFIRM_PRODUCTION_DEPLOY=DEPLOY_GETSAWA_PRODUCTION
CONFIRM_PRODUCTION_CUTOVER=SWITCH_GETSAWA_TO_CLOUDFLARE
CONFIRM_PRODUCTION_WORKER_UPLOAD=UPLOAD_PRODUCTION_WORKER
```

### Staging build variables

```text
NODE_ENV=production
APP_URL=https://staging.getsawa.app
APP_NAME=GetSawa
WEBSITE_PLATFORM_HOST=staging.getsawa.app
CLOUDFLARE_WORKER_SERVICE_NAME=getsawa-staging
CLOUDFLARE_ACCOUNT_ID=<your account id>
CONFIRM_STAGING_ISOLATED=STAGING_IS_ISOLATED
```

### Build secrets required by the guarded script

```text
DATABASE_URL=<environment database URL>
SESSION_SECRET=<environment secret>
CRON_SECRET=<environment secret>
```

Set `APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS` only after migration review for that database. Otherwise the deployment script checks migration status without applying migrations.

Cloudflare Workers Builds injects its own deployment identity (`WORKERS_CI=1`), so the application's runtime `CLOUDFLARE_API_TOKEN` does not need to be exposed merely to authenticate the build/deploy step.

## 5. Runtime variables and secrets

Before the repository deployment, open the environment Worker → **Settings → Variables & Secrets** and configure the production/staging runtime values from `.env.example`.

Core runtime secrets:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CRON_SECRET`
- `NAMESILO_API_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `SMTP_PASSWORD` and the remaining sensitive `SMTP_*` values
- `CLOUDFLARE_API_TOKEN` for GetSawa customer DNS/CDN/publishing operations
- provider credentials for any enabled hosting/email/AI product

Core runtime plain variables include:

- `APP_URL`
- `APP_NAME=GetSawa`
- `WEBSITE_PLATFORM_HOST`
- `CLOUDFLARE_WORKER_SERVICE_NAME`
- `CLOUDFLARE_ACCOUNT_ID`
- provider routing defaults from `.env.example`

Blank optional provider credentials intentionally keep those dependent products fail-closed.

## 6. Database migration

Do not let a production deployment silently guess whether migrations should run. Review migration state against the selected database, then either run explicitly:

```bash
npx prisma migrate status
npx prisma migrate deploy
```

or set the deployment acknowledgement:

```text
APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS
```

The deployment wrapper will then run `prisma migrate deploy` before the OpenNext build.

## 7. Custom domains and crons

`wrangler.jsonc` already defines:

- staging custom domain `staging.getsawa.app`
- production custom domain `getsawa.app`
- staging and production cron triggers

A production deployment therefore changes real traffic and activates production scheduled jobs. Keep the previous Vercel deployment available until post-deploy checks pass.

## 8. Production verification

The guarded production deploy automatically runs:

```bash
APP_URL=https://getsawa.app ./scripts/ops/verify-production-cutover.sh
```

Then verify in the application/admin portal:

1. Authentication and sessions.
2. NameSilo provider health and domain search.
3. PayPal live order creation/capture/webhook handling.
4. Transactional email.
5. Cron-triggered reconciliation/jobs.
6. Customer DNS/CDN/publishing capabilities if enabled.
7. One controlled real order before public launch.

Run the final evidence gate only after the real operational evidence exists:

```bash
npm run ops:launch-readiness
```

## 9. Rollback

Retain the previous Vercel production deployment and DNS state until Cloudflare production verification is complete. Follow `docs/operations/VERCEL_TO_CLOUDFLARE_CUTOVER.md` for rollback/cutover steps and `docs/operations/DISASTER_RECOVERY.md` for recovery procedures.
