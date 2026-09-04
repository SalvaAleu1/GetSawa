# GetSawa

GetSawa is a domain registration, hosting, and digital-services platform. This
repository contains the real working platform across the current development
phases: domain search and registration through NameSilo, PayPal payments,
customer and admin dashboards, domain transfers, DNS management, AI website
creation and publishing, auctions, premium domains, support, affiliates,
developer APIs, and a blog. The codebase follows the core rule that a UI
feature must have a real backend path behind it.

See `SCOPE.md` for the exact implementation boundary and `docs/PHASE2.md` for
the current Phase 2 workstream and acceptance criteria.

## Stack

- **Next.js 15** (App Router) + **TypeScript**, strict mode
- **PostgreSQL** via **Prisma**
- **Tailwind CSS**
- Server-only integrations: **NameSilo** (domains), **PayPal REST API**
  (payments), **Anthropic Messages API** (AI website builder)
- **Zod** for input validation, **bcrypt** for password hashing, **jose** for signed session tokens
- **Vitest** for unit tests (pricing + promotion engines)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

At minimum configure:

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — long random secret
- `APP_URL` — public application URL
- `CRON_SECRET` — secret used to authenticate scheduled maintenance endpoints

NameSilo, PayPal, SMTP and AI credentials must be configured before the related
production services can be activated. Missing provider credentials are treated
as unavailable; the application does not pretend that an unconfigured service
works.

### 3. Set up the database

```bash
npx prisma migrate dev --name init
npm run db:seed
```

For production, use `npm run prisma:migrate`.

### 4. Create the first admin account

Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, then run:

```bash
npm run setup:admin
```

Remove those bootstrap variables after successful setup.

### 5. Run and verify

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

## Production configuration

Before accepting real customers, an administrator must configure the live
providers, activate the intended TLDs and pricing, verify payment webhooks,
configure transactional email, and review the legal pages at `/legal/terms`,
`/legal/privacy`, and `/legal/refund` with qualified counsel.

## Project layout

```
src/app/                 Next.js pages + API routes
src/lib/                 Auth, pricing, checkout, provisioning and providers
src/lib/providers/       NameSilo, PayPal, AI and provider interfaces
prisma/                  PostgreSQL schema and seed
scripts/                 Administrative bootstrap scripts
docs/                    Architecture, deployment, provider and phase docs
```

## Current phases

- **Phase 1:** core account, domain, pricing, checkout, payment, provisioning,
  admin and operational foundations.
- **Phase 2:** expansion and production hardening built on the same provider,
  pricing, checkout and audit architecture. The current Phase 2 workstream is
  tracked in `docs/PHASE2.md`.

## Deployment

See `docs/DEPLOYMENT.md`.

## Security

See `docs/SECURITY.md` before enabling real payments or exposing administrative
features publicly.
