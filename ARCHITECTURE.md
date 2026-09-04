# Architecture

## Layering

```
UI (app/**/page.tsx, client components)
   ↓ fetch()
API routes (app/api/**/route.ts)
   ↓
Business logic (lib/checkout.ts, lib/pricing.ts, lib/promotions.ts, lib/provisioning.ts)
   ↓
Provider adapters (lib/providers/domains/*, lib/providers/payments/*)
   ↓
External services (NameSilo, PayPal)

All of the above read/write through:
Prisma client (lib/prisma.ts) → PostgreSQL
```

No React component talks to Prisma or a provider directly — everything goes
through an API route, and every API route that changes state goes through a
`lib/*` function that owns the business rule (pricing, promotion
eligibility, provisioning). This is what makes it possible to, e.g., add a
second domain registrar later without touching checkout or the dashboard.

## Money

All monetary values are stored and computed as **integer minor units**
(cents) — see `lib/money.ts`. Nothing in the codebase does financial math in
floating point. Prices are always computed server-side
(`lib/pricing.ts` → `computeTldPrice`, `lib/checkout.ts` → `priceCart`) —
the client cart (`lib/cart-client.ts`) stores only *selections* (which
domain, how many years), never prices, so there's nothing sensitive to trust
from the browser.

## Idempotency

- Checkout: `Order.idempotencyKey` is generated server-side and passed to
  PayPal as `PayPal-Request-Id`. `/api/checkout/capture` checks
  `Order.status` before doing anything — a second call on an
  already-processed order is a no-op that returns the current state.
- Provisioning: `OrderItem.provisioningStatus` is checked before calling
  NameSilo, and NameSilo calls themselves are passed an idempotency key
  derived from the `OrderItem.id`.
- Webhooks: `WebhookEvent.eventId` is unique; a repeated PayPal webhook
  delivery is detected and skipped.

## Provider abstraction

`lib/providers/domains/DomainProvider.ts` defines the interface every
registrar must implement. `NameSiloProvider.ts` is the only implementation
today. To add a second registrar:

1. Implement `DomainProvider` in a new file.
2. Add a branch in `DomainProviderFactory.ts` (e.g. driven by a
   `SystemSetting` row or env var).

No other file needs to change — search, checkout, provisioning, and the
customer DNS UI all go through `getDomainProvider()`.

## Promotion engine

Promotions are **data**, not code (`Promotion.rules`, a JSON column). See
`lib/promotions.ts` for the condition/effect schema and
`docs/PROMOTIONS.md`-equivalent examples in the admin UI at
`/admin/promotions`. This is what lets an admin create a new promotion
without a deploy.

## Auth

Sessions are JWTs (`jose`, HS256) that carry only a session ID — the actual
session row lives in Postgres (`Session` model) and can be revoked
server-side (used on password reset and account suspension). Passwords are
hashed with bcrypt (cost factor 12). See `lib/auth.ts`.
