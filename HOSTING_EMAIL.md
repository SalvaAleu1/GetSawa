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
live cPanel/WHM test under **Admin > Providers**. The test verifies:

1. the current credential set can authenticate to WHM;
2. WHM returns packages that the reseller can create;
3. bandwidth reporting required by the customer hosting dashboard is
   accessible; and
4. the credential fingerprint stored with the successful test matches the
   currently deployed credentials.

Hosting product activation additionally requires the product's
`providerProductId` to match one of the package codes returned by that live
test. A typo or package outside the reseller's privileges therefore cannot be
activated for sale.

### Hosting product contract

A production hosting product uses:

- category: `HOSTING`
- provisioning contract: `HOSTING_ACCOUNT`
- renewal contract for recurring plans: `HOSTING_RENEWAL`
- provider product ID: exact WHM package code
- managed domain required: `true`
- verified wholesale cost and currency
- protected retail and renewal prices above the configured cost/margin floor
- billing cycle: `ONE_TIME`, `MONTHLY` or `YEARLY` as supported by the product

Recurring hosting currently supports `MONTHLY` and `YEARLY`. Setup fees remain
off-sale until a dedicated setup-fee checkout lifecycle exists.

### Provisioning and customer access

A paid initial hosting order calls WHM `createacct`. The cPanel username is
deterministically derived from the paid order item so retries can reconcile a
provider account that was created even if the original HTTP response was lost.
GetSawa does not persist a cPanel password.

Customers access cPanel from `/dashboard/hosting`. Each click requests a fresh
WHM user session and redirects to the short-lived HTTPS session URL. The
hosting dashboard also reconciles live account state, disk usage and current
month bandwidth usage when the WHM provider is verified.

Provider-supported file management, backups, FTP accounts, databases and
other advanced hosting controls remain in cPanel instead of being re-created
as weaker duplicate controls inside GetSawa.

### Billing and recovery

Recurring hosting is linked through:

`customer -> product_service_instances -> WHM account -> billing_subscriptions`

The renewal engine:

- issues a protected renewal invoice before the paid period ends;
- refreshes the protected hosting price immediately before each PayPal retry;
- never calls `createacct` for a renewal;
- reactivates the same WHM account after a successful paid renewal when it was
  suspended;
- preserves the customer's automatic-renewal preference;
- supports cancel-at-period-end;
- suspends overdue accounts after the grace period;
- retries provider suspension through the billing cron if WHM was temporarily
  unavailable; and
- suspends/cancels hosting after a fully refunded initial or renewal order.

Cloudflare runs the shared billing renewal/suspension job through
`/api/cron/billing-renewals`. `CRON_SECRET` must be configured in the deployed
Worker environment.

## Business Email — Phase 16

Business email remains fail-closed until Phase 16 selects and integrates a
real mailbox provider. `src/lib/providers/email/EmailProvider.ts` remains the
provider contract, and email products must not be activated merely because a
catalog row exists.

The currently reserved environment values are:

- `EMAIL_PROVIDER`
- `EMAIL_PROVIDER_API_KEY`

They should remain blank until the Phase 16 provider implementation defines
and verifies the actual production contract.
