# Phase 23 Verification — Developer API & Integration Platform

Phase 23 is implementation-complete at the repository gate. This record does not claim a Cloudflare production build or external webhook receiver test has passed.

## Implemented contracts

- API keys remain one-time-view credentials with SHA-256 hashes stored at rest.
- Keys use explicit scopes: `domains:read`, `products:read`, `orders:read`, and `webhooks:manage`.
- Active key creation is capped per customer and revocation remains immediate and audited.
- Every authenticated v1 request receives a request ID and records route, scope, status and latency in a durable usage ledger.
- Existing domain search/pricing endpoints now use the same request logging layer as all new v1 resources.
- Owned-domain and owned-order APIs are account-scoped and omit provider/payment secrets and private billing details.
- Product API output is filtered through the platform's existing commerce-readiness gate.
- Webhook subscriptions are customer-owned, HTTPS-only, limited in count and restricted away from localhost/private literal targets.
- Webhook signing secrets are generated once and encrypted at rest using the existing AES-256-GCM secret utility.
- Webhook event and delivery state is durable. Delivery uses HMAC-SHA256 signatures over `<timestamp>.<raw-body>`.
- Redirect-following is disabled for outbound webhook delivery; failures retry independently of commerce requests and surface operational alerts after repeated failures.
- Implemented lifecycle events are `order.payment_confirmed`, `order.provisioning`, `order.active`, `order.fulfilment_failed`, and `renewal.invoice`.
- Webhook test delivery is idempotency-key protected in the public v1 API.
- Customer Developer API dashboard shows scopes, usage, request errors/latency, subscriptions and delivery attempts.
- Public API documentation is available at `/developers/api`, and `/api/v1` exposes version/resource discovery.
- Cloudflare scheduled delivery is wired through `/api/cron/developer-webhooks` on `9,39 * * * *`.

## Safety boundaries

Phase 23 intentionally does not expose provider credentials, PayPal capture/order IDs, private support conversations, staff/admin records, unrestricted DNS mutation or arbitrary account mutation through v1.

The current per-key rate limiter uses the repository's existing rate-limit implementation. Distributed abuse controls, stronger request-origin controls and broader security review are Phase 24 responsibilities.

## Runtime gate

No GitHub CI result is claimed. The Cloudflare/OpenNext staging build, database migration execution, external HTTPS webhook receiver test and cron execution remain deployment verification gates.
