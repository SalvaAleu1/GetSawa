# Admin guide

## Roles

`AdminRole` on a `User` row: `SUPER_ADMIN`, `ADMIN`, `SUPPORT`, `FINANCE`,
`CONTENT_MANAGER`, `PRODUCT_MANAGER`. Most write endpoints in
`/api/admin/**` restrict which roles can call them (see the
`requireAdmin([...])` calls in each route) — extend those lists as you add
more admin accounts.

There is no in-app "invite an admin" flow in Phase 1 — grant admin access by
setting `adminRole` on a `User` row directly in the database, or build an
invite flow as a follow-up.

## TLD Manager (`/admin/tlds`)

This is the domain pricing engine. Every TLD has a `pricingMethod`:

- **Wholesale + % markup** — set `wholesaleRegisterCents`/
  `wholesaleRenewCents` (NameSilo's cost to you) and `markupPercent`; retail
  price is computed automatically.
- **Wholesale + fixed markup** — same, but a flat cents amount added instead
  of a percentage.
- **Fixed** — set the retail price directly, ignoring wholesale cost.
- **Custom** — same storage as Fixed; use this if you want to signal "this
  was set manually for a reason" in your own records.

A TLD must be **Active** to appear in domain search. Deactivating a TLD
does not affect domains already registered on it.

## Products (`/admin/products`)

Products cover everything that isn't a domain (hosting, email, SSL, add-ons,
etc). A product is created as `DRAFT` and can only move to `ACTIVE` if its
declared `providerName` dependency is actually configured — the API returns
a 409 with `PROVIDER_NOT_CONFIGURED` if you try to activate one that isn't
ready, and the admin UI surfaces that error. This is deliberate: it's the
mechanism that prevents selling something that can't be delivered (spec
sections 121, 150, 172).

## Promotions (`/admin/promotions`)

Promotions are rule + effect pairs stored as JSON
(`Promotion.rules`), evaluated server-side at checkout by
`lib/promotions.ts`. The admin UI exposes the common cases (free item /
percent off, scoped to TLDs or a product kind, optionally new-customer-only,
with premium domains excluded by default). For more advanced rule
combinations, a promotion can also be created directly via
`POST /api/admin/promotions` with a hand-written `rules` object — see the
`PromotionRules` type in `lib/promotions.ts` for the full shape (conditions:
`customer.isNew`, `cart.hasSku`, `cart.hasTld`, `cart.hasKind`,
`cart.minSubtotalCents`; effects: `FREE_ITEM`, `PERCENT_OFF_ITEM`,
`FIXED_OFF_ITEM`).

`priority` + `isStackable`/`isExclusive` control what happens when more than
one promotion could apply — see `selectApplicablePromotions` in
`lib/promotions.ts`.

## Coupons (`/admin/coupons`)

Simpler than promotions — a single code, percent or fixed discount, with
usage limits and a new-customer-only flag. Applied at checkout by passing
`couponCode` alongside the cart.

## Customers (`/admin/customers`)

Search, view a customer's domains/orders/invoices, suspend (revokes all
their sessions immediately) or reactivate, and issue account credit (which
writes both a `CustomerCredit` row and a `LedgerEntry` — never just a bare
balance change, per spec section 109).

## Orders (`/admin/orders`)

Read-only view for now, filterable by status. `provisioningError` is shown
inline when an order has an item that couldn't be automatically provisioned
— this is what a support agent should look at first for a "why didn't my
domain show up" ticket.

## Providers (`/admin/providers`)

Shows configuration status for every integration point (read from
environment variables — actual secret values are never displayed) and lets
you run a **live** connection test against NameSilo and PayPal. This never
reports "operational" without actually calling the provider.
