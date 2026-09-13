# Phase 19 Verification — Website Publishing, Custom Domains and TLS

Phase 19 is implementation-complete at the repository gate. It does not claim that the production Worker, database migrations or a customer Cloudflare zone have been deployed/tested from this execution environment.

Implemented contracts:

- immutable production deployment records tied to `WebsiteVersion` snapshots;
- publish/unpublish transitions that retire or activate production pointers;
- rollback to an earlier immutable deployment without deleting later versions;
- Cloudflare Worker Custom Domains using the documented account Workers Domains API;
- custom-domain eligibility restricted to customer-owned active GetSawa domains whose Phase 17 Cloudflare zone/cutover is already ACTIVE;
- explicit review/approval before replacing conflicting apex/www web DNS records;
- persisted Cloudflare domain and certificate identifiers;
- host-based Worker routing to the same safe website renderer used by platform URLs;
- custom-domain routing only for ACTIVE mappings and PUBLISHED projects;
- apex or `www` attachment (both may be attached independently);
- path redirects with permanent/temporary routing behavior;
- customer deployment history, rollback, domain/TLS and redirect controls;
- detached/unpublished sites stop serving through the custom-host resolver.

Cloudflare's current Workers documentation states that Custom Domains require an active Cloudflare zone and Worker, create the DNS record, and issue the certificate for the attached hostname. The implementation follows that model instead of the previous placeholder CNAME-only flow.

Production gate:

1. run all Prisma migrations through `20260913063000_website_publishing_runtime`;
2. configure `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_WORKER_SERVICE_NAME` in Cloudflare secrets/environment;
3. ensure the token includes the Phase 17 zone permissions plus Workers Scripts Write;
4. deploy the OpenNext Worker and verify its primary application host is listed in `APP_URL`/`WEBSITE_PLATFORM_HOST`;
5. publish a controlled website, attach an active Phase 17 zone, verify apex and/or www TLS, nested page routing, redirect behavior, unpublish, and rollback.

No CI/build pass is claimed here because GitHub currently exposes no project status checks and this environment cannot honestly run the full Cloudflare/OpenNext build. Cloudflare staging remains the runtime gate.
