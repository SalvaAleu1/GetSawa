# Phase 15 Verification — Web Hosting

Phase 15 is implementation-complete when this document is committed. It does
**not** claim that a production WHM server has been connected or that a
Cloudflare production build has passed. Those are deployment/provider gates and
remain intentionally fail-closed.

## Repository review completed

The Phase 15 branch was reviewed against the platform contracts for:

- cPanel/WHM API 1 provider abstraction and HTTPS token authentication;
- live provider verification and credential-rotation invalidation;
- reseller-creatable WHM package discovery and exact package-code activation
  gating;
- managed-domain selection and server-side ownership validation before hosting
  checkout;
- initial account provisioning with deterministic retry reconciliation;
- provider-backed service-instance persistence before order completion;
- monthly/yearly hosting subscription linkage;
- protected wholesale/margin floors for first-period and renewal prices;
- fresh hosting repricing before each renewal payment attempt;
- renewal fulfilment against the existing WHM account (never duplicate
  `createacct` calls);
- failed-payment grace handling and provider suspension;
- cancel-at-period-end and customer auto-renew controls;
- full-refund suspension, including `SUSPENSION_PENDING` retry when WHM is
  unavailable;
- secure temporary cPanel sessions without storing a cPanel password;
- live disk and current-month bandwidth visibility;
- staff hosting inventory and suspension/reactivation controls;
- Cloudflare billing cron routing for renewal and suspension enforcement; and
- removal of obsolete `HOSTING_API_KEY` / generic-hosting configuration docs.

The branch remained a direct descendant of `main` during the final review, so
it is eligible for a non-force fast-forward when the implementation is
promoted.

## Provider fail-closed gate

Hosting is **not** considered operational merely because environment variables
exist. Production requires all of the following:

1. `WHM_BASE_URL`, `WHM_USERNAME` and `WHM_API_TOKEN` are configured in the
   deployment secret store.
2. An authorized administrator runs the live **cPanel / WHM Hosting** provider
   test.
3. The live test succeeds with the currently deployed credential fingerprint.
4. WHM reports at least the account/package capabilities required by GetSawa,
   including bandwidth reporting.
5. Each hosting product references a WHM package code returned as creatable by
   that successful test.
6. Each hosting product has verified wholesale economics, protected retail and
   renewal pricing, managed-domain configuration and the supported provisioning
   / renewal contracts.

If credentials rotate or the live test becomes invalid, product readiness
fails closed and GetSawa does not advertise the provider as operational.

## Cloudflare scheduled enforcement

`cloudflare-worker.ts` maps the `13 * * * *` trigger to
`/api/cron/billing-renewals`, and `wrangler.jsonc` declares the same cron
expression. The route processes due renewal invoices and calls the hosting
past-due/cancellation/suspension enforcement path.

`CRON_SECRET` must be configured in the deployed Worker environment. The cron
endpoint rejects requests when this Bearer secret is missing or incorrect.

## Automated build/check evidence

At the Phase 15 head, GitHub exposes no CI/status checks. The current execution
environment also cannot produce an honest local repository build because it
cannot resolve/clone GitHub for the required local build workspace.

Therefore:

- no CI pass is claimed;
- no local `npm run typecheck`, `npm test`, `npm run build`, or
  `npm run build:cloudflare` pass is claimed; and
- the authoritative runtime gate remains the Cloudflare staging/build process
  defined by the master roadmap.

Before production hosting is activated, deployment must run the Prisma
migrations, complete the Cloudflare build, configure the WHM and cron secrets,
run the live WHM provider test, verify a real reseller package, and execute an
end-to-end paid hosting order/renewal/suspension test against the intended
provider account.
