# CloudSawa deployment and launch sequence

CloudSawa is intentionally in **pre-domain mode** until `cloudsawa.com` is purchased. The repository can be built, tested, connected to the database and providers, and deployed to Cloudflare `workers.dev` without owning the final domain.

## Current pre-domain architecture

- Production-preview Worker: `cloudsawa` on `workers.dev`
- Optional staging Worker: `cloudsawa-staging` on `workers.dev`
- Final planned domain: `cloudsawa.com`
- Database: Neon PostgreSQL
- Registrar: NameSilo
- Payments: PayPal REST
- Edge/runtime: Cloudflare Workers via OpenNext
- Production scheduled jobs: deliberately disabled until final domain activation

The committed `wrangler.jsonc` must remain free of custom-domain routes before the domain is purchased. `npm run ops:cutover-config` enforces this.

## 1. Verify the repository

Every push to `main` runs the CloudSawa quality gate:

```bash
npm run ops:brand-consistency
npm run ops:cutover-config
npm run prisma:generate
npm run typecheck
npm test
npm run build
npm run build:cloudflare
```

## 2. Database

Use the existing Neon production database. For Cloudflare builds, configure the pooled URL as `DATABASE_URL` and the direct/admin URL as `DIRECT_URL`.

Before deployment:

```bash
npx prisma migrate status
npx prisma migrate deploy
npm run db:seed
```

The seed is designed to create safe baseline configuration only; sellable TLDs must still pass pricing/provider readiness before activation.

## 3. Deploy before buying the domain

Create/connect the Cloudflare Worker and use:

```bash
npm run deploy:cloudflare:production
```

During this phase:

- `APP_NAME=CloudSawa`
- `CLOUDFLARE_WORKER_SERVICE_NAME=cloudsawa`
- `APP_URL` may remain unset until Wrangler prints the exact `workers.dev` URL
- `WEBSITE_PLATFORM_HOST` may remain unset for the first upload
- no custom-domain route is active
- no production cron trigger is active

After the first successful upload, set `APP_URL` to the exact HTTPS `workers.dev` URL for outside-in preview checks.

## 4. Required launch providers

Before taking money, configure and pass the in-app provider health checks for:

- NameSilo — live API key and funded registrar balance
- PayPal — live client ID/secret and verified webhook ID
- SMTP — transactional email
- Cloudflare — account ID/API token for customer DNS/CDN/publishing functions

Hosting, business email and AI products may remain disabled until their provider credentials and acceptance tests pass. Domain registration can launch first.

## 5. Pricing safety

Do not manually activate a TLD with an unverified wholesale cost. Use the NameSilo-backed pricing path and CloudSawa pricing policy so retail price is calculated from current provider cost plus the configured margin. Premium domains remain protected from ordinary automatic markup assumptions.

## 6. Buy the domain last

Immediately before public launch, purchase `cloudsawa.com` and add it to the Cloudflare account. Then run:

```bash
CONFIRM_CLOUDSAWA_DOMAIN_OWNED=cloudsawa.com npm run ops:activate-domain
npm run ops:cutover-config
```

That guarded command changes production from `workers.dev` preview to:

- custom Worker domain `cloudsawa.com`
- `workers_dev=false`
- `APP_ENV=production`
- one `* * * * *` Cloudflare scheduler trigger, which dispatches the 12 internal jobs at their own due times

Set:

```text
APP_URL=https://cloudsawa.com
WEBSITE_PLATFORM_HOST=cloudsawa.com
SMTP_FROM="CloudSawa <no-reply@cloudsawa.com>"
```

Then deploy production.

## 7. Final revenue test

Before advertising CloudSawa, make one controlled low-cost real domain purchase:

1. Search an actually available inexpensive domain.
2. Confirm NameSilo wholesale cost and CloudSawa retail price.
3. Complete live PayPal/card checkout.
4. Confirm PayPal capture and verified webhook handling.
5. Confirm NameSilo registration succeeds.
6. Confirm the domain appears ACTIVE in the customer dashboard.
7. Confirm invoice and transactional email.
8. Test a safe failure/refund/reconciliation path.
9. Record the evidence required by `npm run ops:launch-readiness`.

Only after this passes should public domain sales begin.

## 8. First launch scope

Launch **domain search, registration, renewal, transfer and management first**. Keep any provider-dependent hosting/email/AI product unavailable until its own live provider test passes. This lets CloudSawa generate revenue without waiting for every later service.
