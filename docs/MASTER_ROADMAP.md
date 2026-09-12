# GetSawa Master Platform Roadmap

This is the canonical rebuild roadmap for GetSawa. A phase is complete when its implementation is committed, reviewed against repository contracts and safety rules, and is ready for the Cloudflare build/deployment gate. GitHub Actions are not required while the account's monthly Actions allowance is exhausted.

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

### Phase 12 — Domain auctions — CURRENT
Auction discovery, verified inventory eligibility, bidding, bidder controls, anti-sniping, reserve logic, closing, winner payment, inventory reservation, registrar-verified fulfillment, seller proceeds, admin controls, disputes and auditability.

### Phase 13 — Product catalog, bundles and add-ons — UPCOMING
Production catalog for hosting, email, SSL/security, DNS/Anycast, WHOIS privacy, AI builder and other add-ons; provider readiness, wholesale cost, retail pricing, billing cycle, bundles, eligibility, provisioning contracts, provisioning status and renewal behavior. Products without real provisioning providers remain non-purchasable.

### Phase 14 — Payments, billing, invoices, refunds and credits — UPCOMING
Harden PayPal and card-compatible payment paths, payment reconciliation, refunds, credits, invoices, subscriptions/renewals, failed-payment recovery, financial ledger, provider fees and finance reporting.

### Phase 15 — Web hosting product — UPCOMING
Select and integrate a real hosting provider, plans, provisioning, suspension/reactivation, storage/bandwidth state, sites, backups, SFTP/deployment controls where supported, usage visibility and billing lifecycle.

### Phase 16 — Business email product — UPCOMING
Select and integrate a real email provider; domain verification, mailbox creation, aliases, forwarding, quotas, password reset, DNS records, suspension, renewal and admin/customer management.

### Phase 17 — SSL, CDN, DNS and security add-ons — UPCOMING
Operational SSL/TLS products where applicable, Cloudflare-based CDN/security options, DNSSEC/Anycast offerings, malware/security integrations if selected, provisioning, health monitoring and renewals.

### Phase 18 — AI website builder editor — UPCOMING
Upgrade from generated JSON/content into a real editor with templates, sections, pages, navigation, assets, brand settings, responsive preview, SEO controls, regeneration tools, undo/versioning and publishing controls.

### Phase 19 — Website hosting, publishing, custom domains and TLS — UPCOMING
Production publishing pipeline, custom-domain verification, apex/www routing, automatic TLS, version rollback, deployment status, project environments, redirects and domain connection health.

### Phase 20 — Admin control center — UPCOMING
Rebuild admin into a dense operational workspace: customers, orders, products, pricing, domains, payments, providers, provisioning, support, fraud/risk signals, system health, audit logs and role-based access.

### Phase 21 — CMS, promotions, blog, ads and affiliate growth — UPCOMING
CMS-managed public sections, announcements, offers, promo rules, coupons, campaigns, blog/editorial tools, affiliate attribution, commissions, payouts and conversion reporting.

### Phase 22 — Support, notifications, transactional messaging and webhooks — UPCOMING
Ticketing, internal notes, customer notifications, transactional email reliability, templates, delivery status, webhooks/events, escalation paths and operational alerts.

### Phase 23 — Developer API and integration platform — UPCOMING
API keys/scopes, rate limits, domain/product/customer-safe APIs, webhook subscriptions, API documentation, usage logs, revocation, idempotency and developer onboarding.

### Phase 24 — Security, abuse prevention and compliance controls — UPCOMING
Authorization review, CSRF/session protections, rate limiting, fraud/abuse controls, audit coverage, encrypted secrets, staff permissions, data minimization, privacy controls, incident hooks and security test evidence.

### Phase 25 — Analytics, observability and finance reporting — UPCOMING
Business KPIs, product revenue/margin, cohort/conversion funnels, provider health, cron/job status, error reporting, structured logs, performance telemetry, reconciliation dashboards and exportable finance reports.

### Phase 26 — Performance, accessibility, SEO and PWA/mobile quality — UPCOMING
Core Web Vitals, caching, image/font strategy, keyboard/screen-reader accessibility, metadata/schema/SEO, sitemap/robots, responsive QA, installable PWA where appropriate and poor-network behavior.

### Phase 27 — Backup, disaster recovery and operational runbooks — UPCOMING
Database backup/restore verification, provider reconciliation recovery, secret rotation procedures, rollback plans, incident playbooks, recovery objectives and tested restoration evidence.

### Phase 28 — Cloudflare staging and production infrastructure — UPCOMING
Create the actual Cloudflare environments, configure secrets/bindings, database connectivity, Worker routes, cron triggers, logs, staging hostname, migration execution and deployment controls.

### Phase 29 — Vercel-to-Cloudflare cutover — UPCOMING
Validate staging, freeze risky changes, migrate production secrets, switch DNS/custom domain routing, validate payments/webhooks/cron jobs, monitor errors and retain a rollback path before retiring Vercel.

### Phase 30 — Launch readiness, legal, support and operations — UPCOMING
End-to-end acceptance tests, provider live tests, legal/policy review, customer help content, pricing verification, support procedures, admin training, monitoring thresholds and controlled launch checklist.

### Phase 31 — Post-launch resilience and provider expansion — LATER
Add secondary registrars/providers where commercially useful, premium-quote-capable registrar support, local/regional payment options, provider failover, multi-currency expansion, localization, deeper automation and scale optimizations.

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
10. Cloudflare is the target production runtime; Vercel remains transitional until Phase 29 is verified.
11. While GitHub Actions quota is exhausted, do not block development on Actions. Use static review/local checks where available, and treat the Cloudflare build/deployment as the runtime build gate.
