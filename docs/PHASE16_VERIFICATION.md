# Phase 16 Verification — Business Email

Phase 16 is implementation-complete when this document is committed. It does
**not** claim that production OpenSRS credentials have been connected or that a
Cloudflare production build has passed. Those remain deployment/provider gates
and are intentionally fail-closed.

## Repository review completed

The Phase 16 branch was reviewed for:

- concrete OpenSRS Hosted Email OMA JSON provider implementation;
- live company-administration health check;
- credential-fingerprint invalidation after rotation;
- managed-domain mailbox checkout configuration;
- server-side mailbox local-part validation and customer domain ownership;
- unique external mailbox identities across service instances;
- email-domain provisioning before mail-routing cutover;
- bootstrap mailbox password generation without database persistence;
- authenticated customer password changes sent directly to OpenSRS;
- provider-backed quota/usage and mailbox state reconciliation;
- aliases and forwarding management with recipient opt-in disclosure;
- temporary webmail SSO sessions;
- IMAP/SMTP customer connection information;
- explicit DNS cutover instead of silent MX replacement;
- authoritative NameSilo/DNSOwl detection before automated DNS changes;
- no blind overwrite of an existing SPF policy;
- public MX/CNAME/SPF verification through DNS-over-HTTPS;
- support for external authoritative DNS through verification-only mode;
- monthly/yearly protected mailbox renewal pricing;
- provider-specific renewal dispatch so email cannot enter the WHM path;
- cancel-at-period-end and customer auto-renew controls;
- grace-period mailbox suspension and paid-renewal reactivation;
- full-refund provider suspension from both admin and PayPal webhook flows;
- staff mailbox inventory and real suspend/reactivate controls;
- shared billing/invoice labelling for domains, hosting and email; and
- correction of the service-instance status constraint to include the
  `SUSPENSION_PENDING` recovery state already used by Phase 15.

## OpenSRS API contract review

The implementation was checked against current OpenSRS Hosted Email API
references for the operations it uses, including company lookup, domain
creation/reconciliation, mailbox creation/update/query, service suspension,
mailbox deletion and temporary login tokens.

The implementation intentionally uses the Hosted Email Mail Administration
credentials and assigned email cluster. It does not reuse or pretend to use an
OpenSRS Domains API credential.

## DNS safety gate

Mailbox provisioning does not change MX records automatically.

For automated cutover, all of the following are required:

1. the domain is owned by the signed-in GetSawa customer;
2. the OpenSRS email provider is currently live-verified;
3. the active domain provider is configured;
4. the domain is actually using NameSilo/DNSOwl authoritative nameservers; and
5. the customer explicitly confirms the mail-routing cutover.

For external nameservers, GetSawa returns the exact required records but does
not mutate inactive NameSilo DNS. In all cases the final `ACTIVE` email-domain
state depends on public DNS visibility of the required MX and mail CNAME.

## Product activation gate

A recurring OpenSRS mailbox plan remains non-purchasable until it has:

- category `EMAIL`;
- provider `opensrs_hosted_email`;
- provisioning contract `EMAIL_MAILBOX`;
- renewal contract `EMAIL_RENEWAL`;
- a managed-domain requirement;
- a positive configured mailbox storage limit;
- verified wholesale economics;
- protected first-period and renewal prices; and
- a successful live provider test for the current credential fingerprint.

## Build/provider evidence

GitHub Actions are not a required phase gate while the repository's monthly
Actions allowance is exhausted. No CI pass is claimed merely because code is
committed.

Before production Business Email is activated, deployment must:

- run the Phase 16 database migration;
- pass the Cloudflare/OpenNext build gate;
- configure the real OpenSRS Hosted Email secrets;
- run the live provider test against the intended production company/cluster;
- configure at least one product with verified wholesale/renewal economics;
- execute an end-to-end paid mailbox order;
- set a customer mailbox password;
- verify DNS cutover against public DNS;
- verify webmail and IMAP/SMTP access; and
- exercise renewal, suspension and reactivation against the production provider.

No production-provider test or Cloudflare runtime build is fabricated by this
document.
