# GetSawa

GetSawa is a domain registration, hosting, and digital-services platform. This
repository contains the full real, working build across three phases: search
a domain, register it through NameSilo, pay through PayPal, manage it from a
customer dashboard, run the business from an admin dashboard, transfer
domains in, build and publish an AI-generated website, run domain auctions
and a premium domain marketplace, handle support tickets, run an affiliate
program with real PayPal payouts, offer a developer API, and publish a blog —
built with no fake data, no mock providers, and no hidden placeholders.

See `docs/SCOPE.md` for exactly what is and isn't included, and why — a
short list of things (a reseller/partner program, a website template
marketplace, a handful of other AI services) were deliberately left out
rather than faked; that document explains what and why.

## Stack

- **Next.js 14** (App Router) + **TypeScript**, strict mode
- **PostgreSQL** via **Prisma**
- **Tailwind CSS**
- Server-only integrations: **NameSilo** (domains), **PayPal REST API**
  (payments), **Anthropic Messages API** (AI website builder)
- **Zod** for input validation, **bcrypt** for password hashing, **jose** for signed session tokens
- **Vitest** for unit tests (pricing engine, promotion engine)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in at minimum:

- `DATABASE_URL` — your PostgreSQL connection string
- `SESSION_SECRET` — a long random string (`openssl rand -hex 32`)
- `APP_URL` — the public URL you'll deploy to

Everything else (NameSilo, PayPal, AI, SMTP, etc.) can be left blank to
start — the app will run, but the related features will show "not
configured" instead of pretending to work. See `docs/NAMESILO.md`,
`docs/PAYPAL.md`, and `docs/AI_BUILDER.md` for how to fill those in for
real.

### 3. Set up the database

```bash
npx prisma migrate dev --name init   # first time, creates the schema
npm run db:seed                       # adds a starter (inactive) TLD list
```

For a production deploy, use `npm run prisma:migrate` (runs `prisma migrate
deploy`) instead of `migrate dev`.

### 4. Create your first admin account

```bash
# In your .env (or shell), set:
#   INITIAL_ADMIN_EMAIL=you@yourcompany.com
#   INITIAL_ADMIN_PASSWORD=a-strong-password-12-chars-or-more
npm run setup:admin
```

This is the **only** way to create an admin account — there is no default
admin user or default password shipped with GetSawa. Remove
`INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` from your environment once
this has run successfully.

### 5. Run it

```bash
npm run dev       # local development, http://localhost:3000
# or
npm run build && npm run start   # production build
```

Sign in at `/login` with your admin account, then go to `/admin`.

### 6. Configure the business

From `/admin`:

1. **Providers** — confirm NameSilo, PayPal, and (if using the AI builder) AI
   all show "Configured" and pass "Test connection".
2. **TLD Manager** — activate the TLDs you want to sell and set their pricing
   method (wholesale + markup, or fixed).
3. **Products** — add any non-domain products (hosting, email, etc.) — note
   these stay in extension-point form until a real provisioning provider is
   wired in (see `docs/HOSTING_EMAIL.md`).
4. **Promotions / Coupons** — optional, create launch offers.
5. **Auctions / Premium Domains** — optional, list domains for auction or
   flat-price sale.
6. **Blog** — optional, publish launch content.

Once TLDs are active and NameSilo/PayPal pass their connection tests, real
customers can register at `/register` and buy domains, transfer domains in,
bid in auctions, buy premium domains, open support tickets, join the
affiliate program, generate developer API keys, and — once AI is configured
— build and publish a website at `/dashboard/websites`.

## Testing

```bash
npm run test       # unit tests (pricing + promotion engines)
npm run typecheck  # strict TypeScript check
```

## Project layout

```
src/
  app/                    Next.js App Router pages + API routes
    api/                  All backend endpoints (auth, domains, checkout, admin/*, v1/*)
    dashboard/             Customer-facing dashboard
    admin/                 Admin dashboard
    domains/auctions/       Public auction browse + bidding
    domains/premium/        Public premium domain marketplace
    blog/                   Public blog
    sites/[slug]/            Published AI-built customer websites
    sitemap.ts, robots.ts     SEO
  lib/
    providers/domains/     DomainProvider interface + NameSiloProvider
    providers/payments/    PayPalProvider
    providers/ai/           AIProvider interface + AnthropicAIProvider
    providers/hosting/       HostingProvider interface (extension point — no vendor yet)
    providers/email/          EmailProvider interface (extension point — no vendor yet)
    pricing.ts             Domain pricing engine (admin-configurable)
    promotions.ts           Promotion rule engine (JSON rules, server-evaluated)
    checkout.ts              Server-side cart pricing (never trusts the client)
    provisioning.ts           Turns a paid order into an active domain/transfer
    auctions.ts                Race-safe bidding engine (SERIALIZABLE transactions)
    affiliates.ts               Referral tracking + commission accrual
    api-keys.ts                  Developer API key auth
    crypto.ts                  AES-256-GCM encryption for transfer auth codes
    ai/website-schema.ts        Structured (XSS-safe) AI website content shape
prisma/
  schema.prisma            Full data model
  seed.ts                  Safe baseline seed (TLD list only, no fake data)
scripts/
  create-admin.ts          First-admin bootstrap
docs/                      Architecture, provider setup, deployment, security, AI builder, hosting/email
```

## Deploying

See `docs/DEPLOYMENT.md`.

## Security notes

See `docs/SECURITY.md` — read this before going live with real payments.
