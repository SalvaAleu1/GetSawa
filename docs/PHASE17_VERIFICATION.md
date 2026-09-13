# Phase 17 Verification — SSL, CDN, DNS and Security Add-ons

Phase 17 is implementation-complete at the repository gate. This does **not** claim that production Cloudflare credentials have been connected or that a Cloudflare/OpenNext deployment build has passed.

## Implemented contract

- Scoped Cloudflare account/API-token provider with live credential-fingerprint verification.
- Full-zone onboarding in pending state; no false claim that a zone is active before Cloudflare verifies nameservers.
- Conservative DNS import from authoritative NameSilo/DNSOwl records for A, AAAA, CNAME, MX, TXT and CAA.
- Existing SRV or unknown record types block automatic cutover instead of being reconstructed unsafely.
- External-DNS cases fail closed instead of switching nameservers blindly.
- Customer Cloudflare DNS editor for the supported record set before and after cutover.
- Explicit nameserver cutover requiring DNS review confirmation and an `IMPORTED` migration state.
- Existing registrar DNSSEC is disabled before a nameserver change to avoid validation failure during delegation migration.
- Universal SSL and Always Use HTTPS are enabled/reconciled after zone activation. GetSawa does not force an origin SSL mode it cannot prove safe.
- CDN proxying is explicit and limited to apex/www A, AAAA and CNAME web records; mail and verification records remain DNS-only.
- DNSSEC enablement is two-sided: Cloudflare creates DS material and GetSawa publishes it through the registrar integration before recording the resulting Cloudflare state.
- Protected monthly/yearly billing through the shared renewal engine with fresh price validation before PayPal handoff.
- Overdue/refunded service disables CDN proxying but preserves authoritative DNS so a billing event cannot make the customer domain disappear.
- Customer auto-renew and staff suspend/reactivate operations.
- Customer and staff management surfaces expose real provider/service state.

## Activation gate

A security catalog plan is sellable only when it uses category `SECURITY`, provider `cloudflare` (or compatibility alias `cloudflare_security`), profile code `BASELINE`, provisioning contract `CLOUDFLARE_ZONE`, a managed domain, protected verified economics, and `SECURITY_RENEWAL` with a protected renewal price for recurring plans.

The currently deployed Cloudflare credential fingerprint must also have passed the live provider test. Credential rotation invalidates readiness until the test is run again.

## Runtime/provider evidence

The provider/API design was checked against current Cloudflare documentation for zone onboarding, DNS records, Universal SSL, nameserver activation and DNSSEC. GitHub exposes no CI status checks on this project head, and this execution environment does not provide an honest local repository build. Therefore no CI/typecheck/build pass is claimed. Cloudflare staging remains the runtime gate.

Before production activation: run migrations, configure `CLOUDFLARE_ACCOUNT_ID` and a correctly scoped `CLOUDFLARE_API_TOKEN`, pass the live provider test, activate only a readiness-passing Draft plan, then execute an end-to-end zone import/cutover/proxy/SSL/DNSSEC/renewal test on a controlled domain.
