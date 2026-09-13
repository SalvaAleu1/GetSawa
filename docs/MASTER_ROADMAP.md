# GetSawa Master Platform Roadmap

This is the canonical rebuild roadmap for GetSawa. A phase is complete when its implementation is committed, reviewed against repository contracts and safety rules, and is ready for the Cloudflare build/deployment gate. GitHub Actions are not required while the account's monthly Actions allowance is exhausted.

Repository implementation is complete through Phase 31 as of September 13, 2026. This does **not** by itself approve a public production launch: the Phase 30 launch-readiness evidence gate remains authoritative for Cloudflare runtime validation, disaster-recovery proof, provider acceptance, legal/support readiness and the controlled production handoff.

## Status legend

- DONE — implemented and committed
- CURRENT — actively being implemented
- UPCOMING — not yet complete
- LATER — intentionally deferred until prerequisites are ready

## Phases

### Phase 0 — Repository audit and production baseline — DONE
Inventory the existing application, routes, data model, provider abstractions, production gaps, placeholders, deployment assumptions, and current CI health. Preserve working backend logic instead of rewriting blindly.

### Phase 1 — Cloudflare runtime foundation — DONE
Make the existing Next.js application build successfully for Cloudflare Workers using OpenNext; add Wrangler configuration, Cloudflare Cron Trigger routing, observability, and Cloudflare build support while preserving the transition Vercel deployment.

### Phase 2 — Loss-proof commerce and domain pricing — DONE
Use live registrar wholesale pricing, automatic sync, tiered markup, payment-fee recovery, FX reserve, minimum profit and margin floors, promotion/coupon protection, short-lived quotes, and fail-closed registry-premium handling.

### Phase 3 — Design system and application shells — DONE
Create reusable brand primitives, responsive public navigation/footer, customer and admin portal shells, page/section patterns, cards, tables, forms, status treatments, empty/loading states, spacing and accessibility conventions. Replace fragile one-off layouts with shared components.

### Phase 4 — Public storefront and information architecture — DONE
Rebuild the homepage and public navigation into a data-driven storefront with product discovery, truthful provider readiness, service explanations, pricing entry points, support pathways, promotional CMS slots, footer architecture, and responsive presentation.

### Phase 5 — Domain discovery and registration experience — DONE
Deep domain search, extension selection, availability filters, sorting, bulk exact-domain search, TLD explorer, protected registration/renewal/transfer pricing, premium-price states, price transparency, WHOIS/privacy messaging and safe add-to-cart behavior.

### Phase 6 — Cart, checkout and quote integrity — DONE
Professional cart review, server-authoritative quote preview, protected line pricing, coupon preview, quote expiration, payment-provider handoff, stale-price handling, cancelled-payment cart preservation, and full server repricing again before order creation.

### Phase 7 — Customer onboarding, account and security — DONE
Account profile, onboarding checklist, email-verification visibility, password controls, active sessions, revoke-all behavior, TOTP MFA setup/verification/disable controls, recent login history, security status and account notifications.

### Phase 8 — Domain portfolio and lifecycle dashboard — DONE
Domain portfolio, search/filter/sort, expiration health, auto-renew state, bulk actions, registrar state synchronization, detail pages, timelines and operational warnings.

### Phase 9 — DNS, nameservers and DNS security — DONE
Complete DNS record editor, validation, nameservers, DNSSEC/DS record management where supported, propagation guidance, import/export, record history, safe destructive actions and provider reconciliation.

### Phase 10 — Transfers, renewals, locks and privacy — DONE
Transfer-in/out workflows, authorization codes, transfer status and recovery, domain locks, WHOIS privacy, renewal pricing, multi-year renewals, expiry-state handling and lifecycle controls.

### Phase 11 — Premium domains and aftermarket — DONE
Separate registry-premium domains from GetSawa-owned and customer-custody aftermarket inventory; enforce custody verification, acquisition-cost/retail economics, seller consent, protected Buy Now and offer pricing, reservations, PayPal checkout, registrar-verified fulfillment, seller proceeds and auditable settlements. Unverified inventory is never public.

### Phase 12 — Domain auctions — DONE
Auction discovery, verified-inventory eligibility, verified-account bidder controls, self-bid prevention, serializable bidding, anti-sniping, reserve logic, closing, winner payment windows, inventory reservation/release, PayPal capture, registrar-verified fulfillment, seller proceeds, admin controls, cancellation notifications and reconciliation/audit paths.

### Phase 13 — Product catalog, bundles and add-ons — DONE
Production catalog governance for hosting, email, SSL/security, DNS/Anycast, WHOIS privacy, AI builder and other add-ons; verified wholesale-cost metadata, protected retail floors, provider/fulfillment/billing readiness, bundle economics and eligibility, provider service-instance state and checkout-time revalidation. Products or bundles without real provider/provisioning readiness remain non-purchasable.

### Phase 14 — Payments, billing, invoices, refunds and credits — DONE
Production PayPal payment lifecycle with amount/currency verification, webhook and reconciliation convergence, idempotent finance events, invoices, provider-fee capture, refunds and disputes, registrar-priced domain-renewal invoices, retry-safe failed payments, account-credit reservation/application/refund controls, finance reporting and truthful payment-method capability reporting. A separate direct-card gateway remains fail-closed until a real production provider is configured. Build verification evidence is documented in `docs/PHASE14_VERIFICATION.md`; the authoritative runtime build remains the Cloudflare gate.

### Phase 15 — Web hosting product — DONE
Production cPanel/WHM API 1 integration with credential-fingerprint/live-test gating, reseller-creatable package verification, managed-domain checkout configuration, idempotent account provisioning, provider-backed service instances, secure temporary cPanel access, live disk/bandwidth visibility, monthly/yearly protected renewals, failed-payment grace handling, cancel-at-period-end, suspension/reactivation, full-refund suspension recovery, admin operations and Cloudflare scheduled enforcement. Hosting remains fail-closed until real WHM credentials pass the live provider test and the exact product package is verified as creatable. Verification evidence is documented in `docs/PHASE15_VERIFICATION.md`.

### Phase 16 — Business email product — DONE
Production OpenSRS Hosted Email integration with credential-fingerprint/live-test gating, managed-domain mailbox checkout, unique mailbox provisioning, secure password changes without password persistence, webmail SSO, quota/usage state, aliases and opt-in forwarding, explicit mail-DNS cutover, public DNS verification, external-DNS guidance, monthly/yearly protected renewals, cancel-at-period-end, grace suspension/reactivation, full-refund suspension and admin/customer operations. Verification evidence is documented in `docs/PHASE16_VERIFICATION.md`.

### Phase 17 — SSL, CDN, DNS and security add-ons — DONE
Cloudflare-backed full-zone security service with credential-fingerprint verification, conservative DNS import, explicit nameserver cutover, customer DNS editing, Universal SSL/HTTPS reconciliation, web-record proxy controls, registrar-linked DNSSEC, protected recurring billing, refund/past-due proxy suspension and staff/customer operations. Unsafe record shapes such as SRV remain fail-closed rather than being guessed. Verification evidence is documented in `docs/PHASE17_VERIFICATION.md`.

### Phase 18 — AI website builder editor — DONE
Safe structured website editor with templates, brand settings, page/navigation management, typed sections, validated URL assets, SEO controls, responsive preview, AI page/section regeneration, optimistic edit conflicts, immutable versions, restore/undo and immutable publish snapshots. Public sites support real multi-page routing without executing AI-generated HTML/JavaScript. Verification evidence is documented in `docs/PHASE18_VERIFICATION.md`.

### Phase 19 — Website hosting, publishing, custom domains and TLS — DONE
Immutable production deployment history and rollback, Cloudflare Worker Custom Domains for customer-owned active Phase 17 zones, apex/www attachment, explicit conflicting-DNS approval, Cloudflare-managed TLS identifiers, host-based Worker rendering, custom-domain health state and project redirects. The previous CNAME-only/TLS-placeholder path has been replaced. Verification evidence is documented in `docs/PHASE19_VERIFICATION.md`; actual Worker/domain TLS remains a Cloudflare staging/production gate.

### Phase 20 — Admin control center — DONE
Unified operational workspace over the existing production sources of truth: customer/domain/order/support KPIs, finance signals, payment/support/provisioning queues, provider/service health, risk signals, custom-domain failures, audit activity and staff access. Staff role mutation is Super-Admin-only with self-demotion and last-Super-Admin protection. Specialist pages remain authoritative for destructive actions. Verification evidence is documented in `docs/PHASE20_VERIFICATION.md`.

### Phase 21 — CMS, promotions, blog, ads and affiliate growth — DONE
Tracked internal campaigns with click/paid-conversion attribution, scheduled campaign metadata, homepage announcements and scheduled banner controls, CMS slots, existing blog/promotions/coupons integration, idempotent affiliate commissions, paid-order approval validation, pre-payout refund/dispute revalidation, real PayPal payouts and conversion reporting. Campaign destinations are internal-only to prevent open redirects. Verification evidence is documented in `docs/PHASE21_VERIFICATION.md`.

### Phase 22 — Support, notifications, transactional messaging and webhook health — DONE
Durable in-app/email delivery ledger, immediate send plus retry/backoff state, Cloudflare retry cron, customer notification center, order/support delivery migration, support first-response SLA state, internal notes, urgent/reply escalation, delivery failure alerts, manual retry/acknowledgement controls and visibility into failed inbound provider webhook processing. Verification evidence is documented in `docs/PHASE22_VERIFICATION.md`.

### Phase 23 — Developer API and integration platform — DONE
Scoped one-time API keys, ownership-safe domain/order APIs, commerce-ready product API, durable request IDs/usage logs, per-key rate limits, encrypted webhook signing secrets, public-HTTPS webhook validation, signed asynchronous webhook delivery/retry, idempotent test sends, revocation, usage visibility and implementation-backed developer documentation. Order lifecycle events feed developer subscriptions without allowing receiver failures to affect commerce. Verification evidence is documented in `docs/PHASE23_VERIFICATION.md`.

### Phase 24 — Security, abuse prevention and compliance controls — DONE
Browser-origin protection for cookie-authenticated mutations, hardened account/admin response headers, Postgres-backed distributed rate limiting, hashed security subjects, login/checkout abuse evidence, payment/dispute review signals, audited abuse controls, Security & Compliance Center, admin-MFA posture, privacy/data export and tracked deletion-review cases. Verification evidence is documented in `docs/PHASE24_VERIFICATION.md`; penetration testing and legal/regulatory certification remain later launch gates.

### Phase 25 — Analytics, observability and finance reporting — DONE
Authoritative finance/business/growth/support KPIs, product revenue and current-cost margin estimates with unknown-cost disclosure, 30-day signup activation cohorts, provider health, Developer API latency, Cloudflare cron run history, sanitized application-error fingerprints, daily analytics snapshots, finance CSV export and reconciliation-gap dashboards for finance events, refunds, provider/developer webhooks and transactional messaging. Verification evidence is documented in `docs/PHASE25_VERIFICATION.md`; production telemetry validation remains a Cloudflare staging gate.

### Phase 26 — Performance, accessibility, SEO and PWA/mobile quality — DONE
Repository implementation covers font/image/caching strategy, accessibility defaults, metadata/schema/SEO, dynamic sitemap/robots, PWA installability, offline/poor-network behavior and responsive foundations. Real Core Web Vitals, keyboard/screen-reader and installability measurements on Cloudflare remain mandatory Phase 30 launch evidence. Verification is documented in `docs/PHASE26_VERIFICATION.md`.

### Phase 27 — Backup, disaster recovery and operational runbooks — DONE
Backup, checksum, isolated restore, restore verification, provider reconciliation, secret rotation, rollback, incident response and RPO/RTO runbooks are committed. A real production-class backup/isolated restore drill and measured recovery evidence remain mandatory launch blockers until performed. Verification is documented in `docs/PHASE27_VERIFICATION.md`.

### Phase 28 — Cloudflare staging and production infrastructure — DONE
Explicit staging/production Wrangler environments, deployment preflight, migration controls, cron mapping, observability and safe deployment tooling are committed. Actual Cloudflare staging/production runtime deployment evidence, isolated staging data and runtime tests remain external launch gates. Verification is documented in `docs/PHASE28_VERIFICATION.md`.

### Phase 29 — Vercel-to-Cloudflare cutover — DONE
Production Custom Domain/scheduler handoff configuration, runtime fingerprints, cutover verification, webhook checks, reconciliation order and rollback procedure are committed. The real Vercel scheduler shutdown, DNS/Worker handoff and production validation remain a controlled live operation and must never be inferred or guessed from repository state. Verification is documented in `docs/PHASE29_VERIFICATION.md`.

### Phase 30 — Launch readiness, legal, support and operations — DONE
Public support/help content, customer-facing legal cleanup, provider acceptance matrix, monitoring guidance, operator launch runbook and a fail-closed launch-evidence checker are implemented. `npm run ops:launch-readiness` remains deliberately blocked until reviewed runtime, restore, Cloudflare/cutover, migration, security, legal, support, monitoring, handover and enabled-provider evidence exists. Verification is documented in `docs/PHASE30_VERIFICATION.md`.

### Phase 31 — Post-launch resilience and provider expansion — DONE
Provider selection is centralized and fail-closed; domain/payment adapter seams, capability-scoped failover controls, provider onboarding discipline, premium-price safety, market/currency/localization admission rules and resilience validation are implemented. No secondary registrar, regional payment gateway, extra currency or localization is claimed live: each future addition requires a real commercial account, production adapter and acceptance evidence before routing or customer-facing enablement. Verification is documented in `docs/PHASE31_VERIFICATION.md`.

## Working rules

1. Keep `main` deployable; substantial work happens on named phase branches before fast-forwarding into `main`.
2. Backend/provider truth takes priority over UI breadth. A customer action is not complete until its server-side authorization, pricing, provider/provisioning behavior, reconciliation, failure handling and audit trail exist.
3. Never replace a working provider flow with mock, sandbox or simulated behavior in production code.
4. Pricing and checkout must fail safe when wholesale cost, custody, provider capability or provisioning state is uncertain.
5. UI labels must not claim a service is live until its backend/provider provisioning is live.
6. Customer-facing pages must never expose README text, developer instructions, implementation notes, placeholder copy, fake data or setup guidance. Public UI must contain polished product copy backed by real state and real actions.
7. Never create a purchasable product merely because a UI card or database product row exists. Real provider readiness and a supported fulfillment contract are mandatory.
8. Prefer shared primitives and provider abstractions over duplicated one-off code.
9. Every phase should leave data integrity, operational behavior, reconciliation and error states clearer than before.
10. Cloudflare is the target production runtime; Vercel remains transitional until the live Phase 29 cutover evidence is verified.
11. While GitHub Actions quota is exhausted, do not block development on Actions. Use static review/local checks where available, and treat the Cloudflare build/deployment as the runtime build gate.
