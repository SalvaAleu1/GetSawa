# Hosting & Business Email

GetSawa deliberately keeps provider-backed products fail-closed. A catalog
card is never considered a delivered product unless the provider,
provisioning, billing and recovery paths behind it are real.

## Web Hosting — Phase 15 implementation

Web hosting is implemented against **cPanel/WHM API 1** through:

- `src/lib/providers/hosting/HostingProvider.ts`
- `src/lib/hosting-readiness.ts`
- `src/lib/hosting-billing.ts`
- `src/lib/product-provisioning.ts`
- `/dashboard/hosting`
- `/admin/hosting`

Required production secrets:

- `WHM_BASE_URL` — HTTPS WHM control-plane origin, commonly port 2087.
- `WHM_USERNAME` — reseller/root account used by GetSawa.
- `WHM_API_TOKEN` — API token for that account.

Do not put the real token in this repository. Configure it in the deployment
secret store.

### Provider verification gate

Environment variables alone do **not** make hosting sellable. After initial
configuration or any credential rotation, an authorized admin must run the
live cPanel/WHM test under **Admin > Providers**. The test verifies the current
credentials, creatable WHM packages and bandwidth reporting; activation also
requires the exact product package to be present in that verified package set.

### Hosting product contract

A production hosting product uses `HOSTING`, `HOSTING_ACCOUNT`, and for
recurring plans `HOSTING_RENEWAL`, with a managed domain, verified wholesale
cost and protected retail/renewal prices. Recurring hosting supports monthly
and yearly billing. Setup fees remain off-sale until a dedicated setup-fee
checkout lifecycle exists.

### Provisioning, access and recovery

A paid initial hosting order provisions a deterministic WHM account. Customers
access cPanel using a fresh temporary session; GetSawa does not persist a
cPanel password. Recurring hosting reuses the existing provider account,
refreshes protected pricing before payment, supports grace/suspension,
cancel-at-period-end, reactivation after payment, and full-refund suspension.
Cloudflare runs renewal/suspension enforcement through
`/api/cron/billing-renewals` using `CRON_SECRET`.

## Business Email — Phase 16 implementation

Business email is implemented against **OpenSRS Hosted Email OMA JSON API**.
It is intentionally separate from the cPanel hosting account so a customer can
buy a professional mailbox without first buying GetSawa web hosting.

Core implementation:

- `src/lib/providers/email/EmailProvider.ts`
- `src/lib/email-readiness.ts`
- `src/lib/email-billing.ts`
- `src/lib/email-domains.ts`
- `src/lib/service-billing.ts`
- `src/lib/product-provisioning.ts`
- `/dashboard/email`
- `/admin/email`

Required production secrets:

- `OPENSRS_EMAIL_CLUSTER` — `A` or `B`
- `OPENSRS_EMAIL_ADMIN_USER`
- `OPENSRS_EMAIL_ADMIN_PASSWORD`
- `OPENSRS_EMAIL_COMPANY`
- optional `OPENSRS_EMAIL_API_BASE_URL`

These are Hosted Email Mail Administration credentials, not the OpenSRS
Domains API key. Real credentials belong only in the deployment secret store.

### Provider verification gate

Environment variables alone never make an email plan purchasable. After initial
configuration or credential rotation, an authorized admin must run
**Admin > Providers > OpenSRS Hosted Email > Test live connection**. The
successful test stores only health metadata and a credential fingerprint. A
credential change invalidates readiness until the new credentials pass another
live company-administration test.

A recurring mailbox product uses:

- category: `EMAIL`
- provider: `opensrs_hosted_email`
- provisioning contract: `EMAIL_MAILBOX`
- renewal contract: `EMAIL_RENEWAL`
- managed domain required: `true`
- `providerConfig.storageMb`: positive mailbox quota
- verified wholesale cost/currency
- protected first-period and renewal prices
- billing cycle: `MONTHLY` or `YEARLY`

Admin product creation supports those fields directly. Product activation still
runs the same provider/pricing/fulfilment/billing readiness gate used by the
rest of the catalog.

### Mailbox provisioning and passwords

Checkout requires an active/expiring domain already owned by the signed-in
customer and a validated mailbox local part. Pricing remains entirely server
authoritative.

After payment, GetSawa:

1. creates/reconciles the OpenSRS email domain;
2. creates the mailbox with a generated bootstrap password;
3. records the OpenSRS mailbox address as a unique provider service instance;
4. attaches recurring billing when applicable; and
5. requires the customer to replace the bootstrap password from the dashboard.

Mailbox passwords are sent directly to OpenSRS and are **never stored in the
GetSawa database**. Webmail access uses a fresh provider SSO token rather than a
stored mailbox password.

### Mailbox management

`/dashboard/email` provides real provider-backed controls for:

- live storage quota and usage;
- last provider login state where available;
- password changes;
- aliases on the managed email domain;
- external forwarding requests;
- secure webmail SSO;
- IMAP/SMTP connection information;
- automatic-renewal controls; and
- email DNS verification/cutover.

OpenSRS external forwarding requires recipient opt-in. GetSawa therefore does
not describe a new external forwarding recipient as active merely because the
provider accepted the request.

Staff can inspect mailbox/customer/product/DNS/billing/provider state in
`/admin/email` and issue authenticated provider suspend/reactivate actions.

### DNS cutover safety

Mailbox/provider provisioning happens **before** MX changes. Buying email does
not silently replace existing mail routing.

GetSawa derives the exact cluster-specific MX/CNAME records plus the OpenSRS
SPF include. The customer must explicitly approve a DNS cutover before GetSawa
changes mail routing.

When the domain is genuinely authoritative on NameSilo/DNSOwl, GetSawa can:

- replace root MX records with the OpenSRS routing MX;
- replace conflicting `mail` A/AAAA/CNAME records with the required CNAME; and
- add the OpenSRS SPF record only when no SPF record already exists.

An existing SPF policy is never overwritten. If it does not already include
OpenSRS, the dashboard reports that a safe SPF merge is required.

For domains using external nameservers, GetSawa refuses to edit inactive
NameSilo DNS and instead displays the exact records for the customer to add at
the authoritative DNS provider.

In both cases, DNS readiness is determined by **public DNS verification**, not
just by a successful provider API write. The email-domain state becomes active
only after the required MX and mail CNAME are publicly visible.

### Billing and recovery

Business-email renewals share the central billing tables but resolve the
provider-specific service contract before repricing or fulfilment. A renewal:

- refreshes the protected OpenSRS email price before PayPal handoff;
- reuses the existing mailbox and never creates a duplicate mailbox;
- preserves the customer's auto-renew preference;
- supports cancel-at-period-end;
- suspends overdue mailboxes after the grace period;
- reactivates the same mailbox after a successful paid renewal; and
- suspends/cancels the mailbox after a fully refunded initial or renewal order.

Hosting and email now share provider-neutral renewal/refund dispatch, so adding
a second service provider cannot accidentally send a mailbox renewal through
WHM logic.
