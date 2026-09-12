# GetSawa Master Platform Roadmap

This is the canonical rebuild roadmap for GetSawa. A phase is only considered complete when its implementation is integrated and the quality gate passes: TypeScript, unit tests, Next.js production build, and Cloudflare Workers/OpenNext build.

## Status legend

- DONE — merged and verified
- CURRENT — actively being implemented
- UPCOMING — not yet complete
- LATER — intentionally deferred until prerequisites are ready

## Phases

### Phase 0 — Repository audit and production baseline — DONE
Inventory the existing application, routes, data model, provider abstractions, production gaps, placeholders, deployment assumptions, and current CI health. Preserve working backend logic instead of rewriting blindly.

### Phase 1 — Cloudflare runtime foundation — DONE
Make the existing Next.js application build successfully for Cloudflare Workers using OpenNext; add Wrangler configuration, Cloudflare Cron Trigger routing, observability, and CI coverage for the Cloudflare build while preserving the transition Vercel deployment.

### Phase 2 — Loss-proof commerce and domain pricing — DONE
Use live registrar wholesale pricing, automatic sync, tiered markup, payment-fee recovery, FX reserve, minimum profit and margin floors, promotion/coupon protection, short-lived quotes, and fail-closed registry-premium handling.

### Phase 3 — Design system and application shells — CURRENT
Create reusable brand primitives, responsive public navigation/footer, customer and admin portal shells, page/section patterns, cards, tables, forms, status treatments, empty/loading states, spacing and accessibility conventions. Replace fragile one-off layouts with shared components.

### Phase 4 — Public storefront and information architecture — UPCOMING
Rebuild the homepage and public navigation into a complete storefront with product discovery, trust content, service explanations, pricing entry points, support pathways, promotional CMS slots, footer architecture, and responsive mobile presentation.

### Phase 5 — Domain discovery and registration experience — UPCOMING
Deep domain search, multi-TLD results, exact-match and alternatives, category filters, bulk search, TLD explorer, premium-price states, price transparency, WHOIS/privacy messaging, domain recommendations and safe add-to-cart behavior.

### Phase 6 — Cart, checkout and quote integrity — UPCOMING
Professional cart, add-on selection, server-authoritative repricing, quote snapshots, payment-provider handoff, stale-price handling, coupon UX, order recovery, abandoned checkout safeguards, tax hooks, payment confirmation and receipt flows.

### Phase 7 — Customer onboarding, account and security — UPCOMING
Account profile, organization/business details, contact verification, password/security controls, MFA recovery, session/device history, notification preferences, billing profile and onboarding checklists.

### Phase 8 — Domain portfolio and lifecycle dashboard — UPCOMING
Domain portfolio, search/filter/sort, expiration health, auto-renew state, bulk actions, registrar state synchronization, detail pages, timelines and operational warnings.

### Phase 9 — DNS, nameservers and DNS security — UPCOMING
Complete DNS record editor, templates, validation, nameservers, DNSSEC, propagation guidance, import/export, record history, safe destructive actions and provider reconciliation.

### Phase 10 — Transfers, renewals, locks and privacy — UPCOMING
Transfer-in/out workflows, authorization codes, transfer status, domain locks, WHOIS privacy, renewal pricing, multi-year renewals, expiry/grace-state handling and reminder controls.

### Phase 11 — Premium domains and aftermarket — UPCOMING
Separate registry-premium domains from GetSawa-owned/aftermarket inventory, authoritative premium quoting, acquisition cost vs retail price, renewal premium handling, premium search/browse, offers and safe fulfillment.

### Phase 12 — Domain auctions — UPCOMING
Auction discovery, bidding, anti-sniping, bidder eligibility, reserve logic, closing, winner payment, fulfillment, admin controls, disputes and auditability.

### Phase 13 — Product catalog, bundles and add-ons — UPCOMING
Production catalog for hosting, email, SSL/security, DNS/Anycast, WHOIS privacy, AI builder and other add-ons; wholesale cost, retail pricing, billing cycle, bundles, eligibility, provisioning status and renewal behavior.

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

1. Do not merge a phase while the quality gate is red.
2. Keep `main` deployable; substantial work happens on named branches and pull requests.
3. Never replace a working provider flow with mock/sandbox behavior in production code.
4. Pricing and checkout must fail safe when wholesale cost or provider state is uncertain.
5. UI labels must not claim a service is live until its backend/provider provisioning is live.
6. Prefer shared primitives and provider abstractions over duplicated one-off code.
7. Every phase should leave documentation, operational behavior and error states clearer than before.
8. Cloudflare is the target production runtime; Vercel remains transitional until Phase 29 is verified.
