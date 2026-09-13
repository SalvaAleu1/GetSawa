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

## 2. Import the repository into Workers Builds

In Cloudflare Dashboard:

1. Open **Workers & Pages**.
2. Select **Create application** → **Import a repository**.
3. Connect GitHub and authorize repository `SalvaAleu1/GetSawa`.
4. Use branch `main`.
5. Keep the repository root as `/`.
6. Configure the production commands below.

### Build command

```bash
npm run build:cloudflare:production
```

### Deploy command

```bash
npx opennextjs-cloudflare deploy --env=production -- --keep-vars
```

The `production` Wrangler environment resolves to Worker `getsawa-production`. Cloudflare Workers Builds supports Wrangler environment Workers; the deploy command must include the matching `--env=production` flag.

## 3. Build variables and secrets

Workers Builds **build variables/secrets** exist only during the build. Configure at least:

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

If the Next.js build needs database-backed/static-generation data, also provide `DATABASE_URL` and any other required build-time values as masked build secrets. Do not put long-lived production secrets in source control.

Cloudflare Workers Builds injects its own deployment identity (`WORKERS_CI=1`), so the application's runtime `CLOUDFLARE_API_TOKEN` does not need to be exposed merely to authenticate the build/deploy step.

## 4. Runtime variables and secrets

After the Worker exists, open **getsawa-production → Settings → Variables & Secrets** and configure the production runtime values from `.env.example`.

Core runtime secrets:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CRON_SECRET`
- `NAMESILO_API_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `SMTP_PASSWORD` and the remaining `SMTP_*` values
- `CLOUDFLARE_API_TOKEN` for GetSawa customer DNS/CDN/publishing operations
- provider credentials for any enabled hosting/email/AI product

Core runtime plain variables include:

- `APP_URL=https://getsawa.app`
- `APP_NAME=GetSawa`
- `WEBSITE_PLATFORM_HOST=getsawa.app`
- `CLOUDFLARE_WORKER_SERVICE_NAME=getsawa-production`
- `CLOUDFLARE_ACCOUNT_ID`
- provider routing defaults from `.env.example`

Blank optional provider credentials intentionally keep those dependent products fail-closed.

## 5. Database migration

Do not let a production deployment silently guess whether migrations should run. Review migration state against the production database, then run:

```bash
npx prisma migrate status
npx prisma migrate deploy
```

The repository deployment wrapper supports the explicit `APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS` acknowledgement when deploying from an authorized shell.

## 6. Custom domain and crons

`wrangler.jsonc` already defines the production custom domain `getsawa.app` and the production cron triggers. A production environment deployment therefore changes real traffic and scheduled jobs; do not point DNS/cut over from Vercel until the Worker build and health checks pass.

## 7. Production verification

After deploy:

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

## 8. Rollback

Retain the previous Vercel production deployment and DNS state until Cloudflare production verification is complete. Follow `docs/operations/VERCEL_TO_CLOUDFLARE_CUTOVER.md` for rollback/cutover steps and `docs/operations/DISASTER_RECOVERY.md` for recovery procedures.
