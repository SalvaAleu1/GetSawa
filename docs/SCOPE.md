# Scope — what's in Phase 1 and what isn't

The original GetSawa specification describes a very large platform: domain
registration, hosting, business email, an AI website builder, auctions, an
affiliate/reseller program, and a full commerce/marketing engine on top. That
is realistically a multi-month build for a team, not something that can be
shipped as genuine, tested, production software in a single pass.

This repository implements the **critical path** the spec itself identifies
as Phase 1 (its own section 162), built with no shortcuts on the core rule:
**never let a UI feature exist without the backend that makes it real.**

## What is fully implemented and real

- Account system: registration, email verification, login, password reset,
  session management (revocable, DB-backed), rate limiting, audit logging.
- **Domain search** with live availability from NameSilo — no cached or fake
  "available" states.
- **Admin-configurable domain pricing engine** — fixed / wholesale+percent /
  wholesale+fixed / custom, all editable from `/admin/tlds` with no code
  changes.
- **Checkout**: server-side cart repricing (client prices are never trusted),
  PayPal order creation, payment capture with amount verification, invoice
  generation, idempotent order handling (a double "Pay" click cannot double-
  charge or double-register a domain).
- **Domain registration provisioning**: on confirmed payment, the app
  re-checks availability and registers the domain through NameSilo, stores
  the result, and only then shows it as active. If NameSilo fails, the order
  is marked `PROVISIONING`/failed with a visible reason — never silently
  marked complete.
- **Domain renewal** provisioning (same real-provider path).
- **DNS, nameserver, lock, and auto-renew management** — every action calls
  NameSilo first and only updates the local record on success.
- **PayPal webhooks** — signature-verified, idempotent, used as a safety net
  alongside the synchronous capture flow.
- **Promotion engine** — JSON-defined rules evaluated server-side, with
  premium domains excluded from automatic promotions by default (spec
  section 7), priority/stacking logic, and a working admin rule builder for
  the common cases (free item / percent off / fixed off, scoped by TLD or
  product, new-customer-only, capped total discount).
- **Coupons** with usage limits, minimum order, new-customer restriction.
- **Admin dashboard**: real metrics from the database (no fake numbers),
  TLD manager, product catalog with a genuine activation workflow (a product
  cannot go `ACTIVE` unless its declared provider dependency is actually
  configured), customer management (search, suspend/reactivate, issue
  credit with a ledger entry), order list, and a provider health page that
  runs **live** connection tests rather than reporting a static "configured"
  flag.
- Unit tests for the two places a silent bug would cost real money: the
  pricing engine and the promotion engine.

## What is fully implemented and real (Phase 2 additions)

- **Domain transfers** — full customer flow: submit a domain + EPP/auth code
  (encrypted at rest with AES-256-GCM, never stored in plaintext — see
  `lib/crypto.ts`), priced through the same checkout as everything else,
  submitted to NameSilo on confirmed payment, with a status dashboard
  (`/dashboard/transfers`) that can refresh live status from the registry
  and automatically add the domain to the customer's portfolio once
  complete.
- **AI Website Builder** — real integration against the Anthropic Messages
  API: structured (non-HTML, XSS-safe) content generation, an editor,
  version history, and a genuinely working publish flow that serves the
  finished site at `/sites/{slug}` on the platform's own domain — this is
  real hosting of the generated site, not a mockup. See `docs/AI_BUILDER.md`
  for exactly what is and isn't automated (custom-domain SSL is the one
  explicit gap — documented there, not hidden).
- **Domain-to-website connection** — a real NameSilo CNAME record is created
  when a customer connects a registered domain to an AI-built site.

## What is fully implemented and real (Phase 3 additions)

- **Domain auctions** — real, database-transactional bidding (SERIALIZABLE
  isolation, retried on conflict, so two simultaneous bids can never both
  "win"), anti-sniping auto-extension, admin auction management, and a real
  PayPal payment flow for the winning bidder that attempts to register the
  domain through NameSilo on payment. If GetSawa doesn't directly control
  the auctioned domain at the registry, that final handoff needs a manual
  admin step — documented in the code, not hidden.
- **Premium domain marketplace** — admin-managed listings, public browse and
  buy-now page, real checkout integration (a premium domain's price is a
  flat acquisition cost, not multiplied by registration years).
- **Support tickets** — full customer + admin thread UI, admin-only internal
  notes, status/priority/assignment.
- **Affiliate / referral program** — a real referral link (`/r/{code}`) sets
  a tracking cookie; a referred customer's first paid order creates a real,
  database-tracked commission; commissions move PENDING → APPROVED (after a
  hold period, requested by the affiliate) → PAID via a genuine PayPal
  Payouts API call triggered by an admin. No fake balances — every cent is a
  `Commission`/`Payout` row.
- **Developer API** — customers can generate scoped API keys (hashed at
  rest, shown once) and call a real, authenticated, rate-limited public API
  (`/api/v1/domains/search`, `/api/v1/domains/pricing`) — the same live
  NameSilo-backed data the website itself uses, not a separate mocked
  dataset.
- **Blog/CMS** — admin-authored posts (draft/publish), public blog list and
  post pages, included in the sitemap.
- **SEO basics** — `/sitemap.xml` (TLD landing pages, blog posts, key static
  pages) and `/robots.txt`, generated from real data rather than hard-coded.
- **TLD landing pages** (`/domains/{extension}`) — pricing pulled live from
  the same pricing engine as search.

## What is scaffolded but intentionally NOT wired to a real provider yet

These exist in the data model and the product catalog / provisioning engine
has a defined slot for them, but there is no real hosting, email, or AI
provider integrated. Per the spec's own rule (sections 22, 26, 87, 121, 172),
**a product without a configured provider cannot be activated** — the admin
UI will refuse and explain why, and the provisioning engine marks any such
order item `FAILED` with a clear note rather than pretending to deliver it:

- **Hosting provisioning** and **business email provisioning** — the
  `HostingProvider`/`EmailProvider` interfaces exist (same pattern as
  NameSilo/PayPal), gated the same way, but have no real vendor behind them
  since none was specified. See `docs/HOSTING_EMAIL.md` for how to add one.
- SSL issuance for custom (non-platform) domains — see the SSL note in
  `docs/AI_BUILDER.md`.
- Support ticket file attachments (spec mentions attaching files; the
  ticket/message data model and UI support text only in this phase).

## Explicitly out of scope for this build

These are named in the original specification but were deliberately not
attempted here — building a shallow version of any of them would be worse
than not building them, per the platform's own "never fake a feature" rule:

- **Reseller / partner program** (spec section 63) — the spec itself
  describes this as "future-ready architecture," not a concrete feature;
  wholesale margin logic and white-label branding for resellers is a
  substantial system of its own with no clear spec beyond "should exist
  eventually."
- **Website template marketplace, plugin system, e-commerce website
  builder** (spec sections 138–140) — explicitly described in the spec as
  something to "introduce progressively." These would each be a project on
  the scale of the AI website builder itself.
- **AI logo generator, AI chatbot builder, and the rest of the AI services
  list beyond the website builder** (spec section 35) — the `AIProvider`
  pattern established here (see `docs/AI_BUILDER.md`) is the right shape to
  extend for these, but each needs its own prompt design, output schema, and
  UI; none is implemented.
- A background job scheduler for renewal reminders, abandoned-cart emails,
  and auction auto-closing on a timer (auctions currently close lazily, on
  the next page view or bid attempt after their end time — functionally
  correct, but not proactive). Wiring in a real cron/queue system is
  infrastructure-specific to how you deploy this app.

## Why this split

Building fake versions of hosting/email/AI provisioning would violate the
spec's most important rule (section 183: never confuse a UI feature with a
functional feature) worse than not building them at all. The architecture —
provider interfaces, product activation gating, provisioning engine — is
designed so adding a real hosting or email provider later is a matter of
implementing one more provider class and pointing a `Product.providerName`
at it, not a rewrite.

## Recommended next steps, in order

1. Get NameSilo and PayPal live and passing `/admin/providers` connection
   tests. Confirm the full domain purchase flow end-to-end with a real
   (small) transaction before advertising it publicly.
2. Add real legal pages (`/legal/terms`, `/legal/privacy`, `/legal/refund`)
   reviewed by a lawyer — the current pages are explicitly marked as
   placeholders and must not be used as-is.
3. Get an Anthropic API key configured if you want the AI Website Builder
   live; test it from `/admin/providers`.
4. Pick a hosting and/or email vendor and implement `HostingProvider`/
   `EmailProvider` against it (`docs/HOSTING_EMAIL.md`).
5. Add a background job runner (e.g. a scheduled task or queue worker) for
   renewal reminders and expiry handling — the DB has what it needs
   (`Domain.expiresAt`, `autoRenew`) but no scheduler is wired up yet.
6. If custom-domain SSL for AI-built websites matters to you, add
   certificate automation in front of the app (`docs/AI_BUILDER.md`).
7. If you plan to run auctions, add a real cron/queue job that calls
   `closeAuctionIfExpired` on a timer (`src/lib/auctions.ts`) instead of
   relying on the current lazy-close-on-view behavior — functionally
   correct today, but an auction with no further traffic after its end
   time won't close itself until someone loads it.
8. Review `docs/SECURITY.md`'s "what you must add before/while scaling"
   section — MFA, distributed rate limiting, and file-upload validation
   are the main gaps once this handles real traffic and money at volume.
