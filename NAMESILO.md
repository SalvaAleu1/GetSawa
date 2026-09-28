# NameSilo setup

Reference: https://www.namesilo.com/api-reference and
https://www.namesilo.com/support/v2/articles/account-options/api-manager

## 1. Get an API key

1. Log into the production NameSilo account.
2. Go to **Account Options → API Manager**.
3. Generate an API key.
4. Store the key only in the approved CloudSawa secret store/runtime environment. Never commit it to GitHub.
5. If an environment with a stable outbound IP is used, apply NameSilo's supported API access restrictions where practical.

CloudSawa's Admin → Providers test uses the non-destructive `getPrices`
operation to prove that the deployed credential can reach NameSilo.

## 2. Sandbox and production testing

NameSilo documents a sandbox/test environment that can be requested from
NameSilo support. Use it where available for integration exercises.

The final production acceptance still requires the real NameSilo production
account because wholesale prices, account funding and a real registrar
registration must be verified before public launch.

Never use a premium-capable extension merely because it appears inexpensive in
a standard TLD price list. Registry-premium pricing can differ substantially
from the ordinary TLD price.

## 3. Fund the production NameSilo account

A production registration must have an accepted payment source at NameSilo.
Before the controlled live CloudSawa purchase:

1. Add enough NameSilo account funds for the test registration and a safety
   reserve, or maintain another NameSilo-supported production payment method.
2. Enable NameSilo low-balance notifications if available for the account.
3. Record the starting balance outside the repository as launch evidence.
4. Reconcile the ending balance against the registrar registration result.

CloudSawa must never accept customer payment for a domain that it cannot afford
to provision at the registrar.

## 4. Configure CloudSawa

Production runtime secrets/variables:

```
NAMESILO_API_KEY=<secret>
NAMESILO_API_BASE_URL=https://www.namesilo.com/api
NAMESILO_SANDBOX=false
```

Do not put the real API key in source control, documentation, screenshots or
launch evidence.

## 5. Initial launch TLD policy

The current NameSilo adapter deliberately declares
`supportsExactPremiumPricing() === false`. CloudSawa therefore fails closed
for TLDs that may require an authoritative registry-premium quote before
payment.

For the initial domain-only launch:

- start with `.com`, `.net` and `.org`;
- keep `.app`, `.dev`, `.co`, `.africa`, `.io` and other
  premium-capable extensions inactive until an exact premium-quote-capable
  registrar path is implemented and accepted;
- activate a TLD only after its live NameSilo wholesale register, renewal and
  transfer prices have been synchronized and reviewed.

This restriction is intentional loss prevention. It can be expanded later
without weakening the pricing safeguards.

## 6. Wholesale price synchronization

The application has both an admin pricing-sync endpoint and a scheduled pricing
sync job. The sync stores NameSilo's latest standard wholesale prices for
active TLDs.

Checkout does not rely only on the stored value: it fetches a fresh registrar
wholesale snapshot and applies CloudSawa's server-side retail safety floor
before allowing a normal domain transaction. Promotions and coupons are not
allowed to reduce a domain below that floor.

After NameSilo is connected:

1. Keep all launch TLDs inactive.
2. Test the provider from Admin → Providers.
3. Synchronize wholesale prices.
4. Review registration, renewal and transfer economics.
5. Activate only the approved launch TLDs.
6. Run another price sync immediately before the controlled live purchase.

## 7. Production acceptance

NameSilo is accepted for launch only after evidence shows:

- the production credential passes the Admin provider test;
- live wholesale pricing is returned for every active launch TLD;
- the NameSilo account can fund the controlled registration;
- CloudSawa's quote uses a fresh wholesale value and stays above its safety
  floor;
- one inexpensive real domain is successfully registered and appears active in
  the customer dashboard;
- registrar/account reconciliation agrees with the CloudSawa order and invoice.

## Operations used

`checkRegisterAvailability`, `getPrices`, `registerDomain`,
`renewDomain`, `transferDomain`, `checkTransferStatus`, `getDomainInfo`,
`listDomains`, `changeNameServers`, `dnsListRecords`, `dnsAddRecord`,
`dnsUpdateRecord`, `dnsDeleteRecord`, `domainLock`, `domainUnlock`,
`addAutoRenewal`, `removeAutoRenewal`, `addPrivacy`,
`removePrivacy`.

If a provider call changes or begins failing, compare the adapter against
NameSilo's current API reference before changing CloudSawa's financial or
provisioning logic.
