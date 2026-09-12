# GetSawa Platform Audit — 12 September 2026

This document is the rebuild baseline for turning the existing GetSawa codebase into a deep, production-grade domain and digital-services platform and moving deployment from Vercel to Cloudflare Workers.

## Executive conclusion

The repository is not an empty prototype. It already contains substantial backend and operational foundations: account security, domains, NameSilo integration, PayPal order/capture/webhook flows, DNS and domain controls, billing lifecycle code, auctions, premium-domain records, support, affiliates, developer API keys, an AI content generator, audit logs, admin operations, and scheduled maintenance endpoints.

The main shortcomings are:

1. The public/customer/admin UI is much shallower than the backend surface.
2. Hosting and business-email products have provider interfaces but no actual vendor implementation.
3. Premium-domain and standard-domain pricing do not yet have the loss-proof live quote/markup/fee/floor architecture required for production commerce.
4. The AI website builder publishes structured content inside the GetSawa application rather than provisioning a complete independent website-hosting pipeline.
5. Cloudflare Workers compatibility and scheduled operations have not previously been tested.
6. Several production controls are single-instance or incomplete for an edge-distributed deployment.
7. The documented production launch checklist has not been completed.

The rebuild should preserve proven backend logic and replace/extend incomplete areas rather than restart from zero.

---

## 1. Existing systems to preserve

### Identity and account security

- Registration, login, logout, email verification and password reset.
- Database-backed revocable sessions.
- TOTP MFA and privileged-account controls.
- Login events and audit logging.
- Customer profile/security APIs.
- Admin roles.

### Domain platform

- NameSilo provider implementation.
- Live availability calls.
- Domain registration and renewal provisioning.
- Domain transfer flow and encrypted EPP/auth codes.
- DNS record management.
- Nameserver management.
- Registrar lock/unlock.
- WHOIS privacy controls.
- Auto-renew controls.
- Domain synchronization/expiry maintenance endpoints.

### Commerce and finance foundation

- Server-side cart repricing.
- Orders and order items.
- PayPal REST order creation and capture.
- PayPal webhook verification.
- Refund and reconciliation paths.
- Invoices.
- Customer credit/ledger concepts.
- Promotions and coupons.
- Billing renewal lifecycle.
- Provisioning recovery.

### Marketplace/engagement foundation

- Premium-domain records.
- Domain auctions and bidding logic.
- Customer/admin support tickets.
- Affiliate/referral tracking and PayPal payouts.
- Blog/CMS.
- Developer API keys and public domain API routes.

### AI website foundation

- Anthropic provider implementation.
- Structured website-content generation.
- Website project records.
- Basic edit/version/publish flows.
- Public rendering at `/sites/{slug}`.
- Basic NameSilo CNAME connection for `www`.

---

## 2. Systems that exist but need major production work

### Domain pricing

Current strengths:
- TLD-level fixed pricing.
- Wholesale + fixed markup.
- Wholesale + percentage markup.
- Separate registration/renewal/transfer values.

Required rebuild:
- Exact-domain live registrar quote at search and again before payment.
- Premium-domain quote support from the registrar, not only local marketplace rows.
- Configurable tiered markups by wholesale-cost range.
- Payment-processor fee recovery.
- FX/currency buffer.
- Minimum absolute profit.
- Minimum margin percentage.
- Never-sell-below-cost invariant.
- Explicit loss-leader override requiring privileged authorization.
- Quote IDs and expirations.
- Final quote revalidation immediately before creating payment.
- Wholesale cost snapshots stored on each order item for profitability/audit reporting.
- Renewal-price visibility before purchase.
- Price-sync history and alerts when supplier prices change materially.

### Promotions and coupons

Current discount logic is server-side and premium domains are excluded by default, but discounts are not constrained by a wholesale-cost/profitability floor. All promotional calculations must pass through the new margin guard.

### Checkout and payment experience

Current checkout redirects the customer to PayPal approval.

Required rebuild:
- Deep cart with domain configuration and add-ons.
- PayPal wallet plus eligible direct debit/credit-card fields.
- Payment method abstraction for future Equity/e-commerce acquiring or another approved gateway.
- Saved checkout state and recovery.
- Quote expiration/repricing UX.
- Payment failure/retry UX.
- Fraud/risk hooks.
- Taxes where applicable.
- Currency presentation/conversion architecture.
- Better invoices/receipts/refund status.

### Rate limiting

Current limiter is an in-process `Map`, explicitly documented as single-instance only. This is unsuitable as the sole production protection on globally distributed Workers. Replace its storage with a Cloudflare-native/shared mechanism (for example Durable Objects or another selected distributed rate-limit store) while retaining the current API contract.

### Transactional email

Current delivery uses Nodemailer/SMTP. It needs a Workers compatibility test and should preferably gain an HTTP-API transactional email provider abstraction so critical identity/payment messages are not dependent on SMTP socket behavior.

### AI website builder

Current publish changes a database state and serves generated content through the GetSawa app. Custom-domain connection creates a `www` CNAME and explicitly does not automate custom-domain TLS.

Required rebuild:
- Real visual/site editor.
- Template/design system.
- Multiple page layouts and reusable sections.
- Media library and object storage.
- Forms and submissions.
- SEO controls.
- Navigation editor.
- Responsive preview.
- Version history/rollback.
- Publish deployments.
- Cloudflare custom hostnames/domain routing.
- Automatic TLS.
- Apex + `www` handling.
- Deployment status and rollback.
- Analytics.
- Backups.
- Optional e-commerce later.

---

## 3. Provider gaps

### Hosting

`HostingProvider` currently resolves to an unconfigured provider. No hosting account can be genuinely provisioned yet.

Needed:
- Select actual wholesale/reseller hosting architecture.
- Implement account creation/suspension/unsuspension/termination.
- Usage/storage/bandwidth synchronization.
- Plan upgrades/downgrades.
- Backups and restore.
- Control panel or GetSawa-native management.
- Domain/DNS integration.
- Recurring billing and dunning.

### Business email

`EmailProvider` currently resolves to an unconfigured provider.

Needed:
- Select mailbox provider/reseller architecture.
- Create/delete/suspend mailboxes.
- Alias/forwarder management.
- Storage quotas.
- Password reset/admin controls.
- MX/SPF/DKIM/DMARC automation.
- Mailbox billing and renewal lifecycle.

### SSL/security products

GetSawa lacks a complete sell/provision/manage lifecycle for SSL/security add-ons. AI-site custom-domain TLS is not automated.

---

## 4. UI/UX rebuild scope

The current UI has useful routes but a shallow shell. The rebuild must add a real design system and deep navigation rather than only increasing page count.

### Public platform

Build full product areas for:
- Domains
- Transfers
- Premium domains
- Marketplace/auctions
- Hosting
- WordPress/managed website products where applicable
- AI Website Builder
- Business Email
- SSL & Security
- DNS
- WHOIS tools
- Pricing
- Deals/promotions
- Business tools
- Affiliate/partner/reseller
- Developer/API
- Support/knowledge base/status
- Company/legal pages

Use rich mega navigation, product comparison, search/filtering, pricing matrices, FAQs, contextual recommendations, status/error states, and complete mobile layouts.

### Customer control panel

Deep workspaces are required for:
- Overview/alerts/recommendations
- Domains and per-domain control center
- DNS zones
- Transfers
- Websites
- Hosting
- Email
- SSL/security
- Marketplace activity
- Orders
- Invoices
- Subscriptions/renewals
- Payment methods
- Credits
- Support
- Notifications
- Developer API/webhooks
- Account/security/sessions/MFA

### Admin/operations platform

Expand into a full back office:
- Executive overview
- Customers/KYC/risk where relevant
- Orders
- Payments/refunds/chargebacks
- Finance/COGS/margin/profit reporting
- Domains/registrar synchronization
- TLD catalog
- Pricing rules and provider cost history
- Premium pricing
- Products/add-ons
- Hosting provisioning
- Email provisioning
- Promotions/coupons/campaigns
- Marketplace/auctions
- Affiliates/resellers
- Support/SLA
- CMS/navigation/banners
- Provider health/webhook health
- Scheduled jobs
- Audit logs
- Staff roles/permissions
- Feature flags/settings
- Incident/operations center

---

## 5. Cloudflare migration

### Decision for first migration

Use Cloudflare Workers with `@opennextjs/cloudflare` for the existing Next.js 15 application. This minimizes framework churn during infrastructure migration. Re-evaluate Cloudflare's vinext path after the platform is stable and/or after a controlled Next.js 16 upgrade.

### Added on `cloudflare-platform-rebuild`

- OpenNext Cloudflare build tooling.
- Wrangler configuration.
- Custom Worker entrypoint.
- Cloudflare Cron Trigger mapping for all seven existing Vercel cron schedules.
- CI Cloudflare build gate.
- Prisma package externalization for workerd-specific resolution.

### Infrastructure still required before production cutover

- Cloudflare Workers project linked to this GitHub repository.
- Production secrets/variables in Cloudflare.
- PostgreSQL connectivity strategy verified from Workers.
- Database migration process that runs outside request handling.
- Distributed rate limiting.
- Transactional email compatibility/provider.
- PayPal webhook URL changed to final GetSawa domain after cutover.
- NameSilo API access verified from Cloudflare egress.
- Observability/logging and alerts.
- Custom domain and DNS cutover plan.
- Staging environment.
- Database backups/recovery test.
- End-to-end payment/domain registration test.

### Vercel cron replacement

The following schedules are preserved as Cloudflare Cron Triggers:

- `17 * * * *` → domain synchronization
- `37 * * * *` → domain expiry handling
- `*/10 * * * *` → provisioning recovery
- `13 * * * *` → billing renewals
- `*/15 * * * *` → payment reconciliation
- `23 6 * * *` → renewal reminders
- `*/5 * * * *` → auction close

Do not remove Vercel production schedules until the Cloudflare Worker has been verified in staging to avoid duplicate/missed lifecycle operations during cutover.

---

## 6. Rebuild sequence

### Foundation A — Cloudflare compatibility and operational safety
- Get Cloudflare build green in CI.
- Resolve Prisma/Node/runtime incompatibilities.
- Verify scheduled handlers.
- Add staging deployment.
- Replace single-instance rate limiting.
- Verify email delivery.

### Foundation B — loss-proof commerce
- Live provider pricing sync.
- Exact-domain quote service.
- Premium pricing.
- Tiered markup rules.
- Payment fee/FX/minimum-profit engine.
- Quote expiry and checkout revalidation.
- Promotion margin guard.
- COGS and profit snapshots.

### Foundation C — design system and information architecture
- UI tokens/components.
- Public mega navigation.
- Responsive application shell.
- Tables, filters, search, command surfaces, drawers, modals, alerts, status components.
- Customer/admin navigation redesign.

### Product D — domains to full depth
- Deep search/suggestions/bulk search/TLD explorer.
- Cart add-ons.
- Per-domain control center.
- WHOIS/privacy/DNSSEC/forwarding/contact management.
- Transfer lifecycle.
- Renewal/recovery/restore UX.
- Premium/marketplace/auction completion.

### Product E — payments and billing
- PayPal wallet + eligible card checkout.
- Gateway abstraction.
- Subscription/renewal engine hardening.
- Dunning.
- Refunds/chargebacks.
- Payment methods and invoices.

### Product F — website platform
- Full AI builder/editor.
- Cloudflare site deployment/custom hostname/TLS pipeline.
- Media/forms/SEO/analytics/versioning.

### Product G — hosting, email and security
- Select providers.
- Implement provider adapters.
- Provisioning and lifecycle dashboards.
- DNS automation and renewals.

### Product H — growth/business systems
- Affiliate completion.
- Reseller/partner system.
- Promotions/marketing CMS.
- Knowledge base/status.
- Analytics and funnel reporting.

### Product I — launch hardening
- Security review.
- Load testing.
- Backup/restore drill.
- Failure/recovery testing.
- Provider outage behavior.
- Fraud controls.
- Legal/compliance review.
- Production cutover and post-launch monitoring.

---

## Non-negotiable rules

1. No public control without a working backend path.
2. No domain purchase without a live/recent provider quote and final pre-payment revalidation.
3. No automatic promotion may sell below the configured margin floor unless a privileged loss-leader override explicitly funds it.
4. No hosting/email/security product may be marked live without real provider provisioning and a successful end-to-end test.
5. No Cloudflare cutover until the Workers build, database connectivity, cron jobs, PayPal webhook, NameSilo operations and transactional email have been verified in staging.
6. Keep `main` stable; build through reviewed branches/PRs with CI.
