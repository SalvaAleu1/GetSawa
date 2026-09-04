# NameSilo setup

Reference: https://www.namesilo.com/api-reference and
https://www.namesilo.com/support/v2/articles/account-options/api-manager

## 1. Get an API key

1. Log into your NameSilo account.
2. Go to **Account Options → API Manager**.
3. Generate an API key. NameSilo lets you restrict it by IP — restrict it to
   your production server's outbound IP if your hosting provider gives you a
   stable one.

## 2. Fund your NameSilo account

Domain registrations/renewals are charged against your NameSilo account
balance at the time of the API call — NameSilo does not invoice you
separately. Keep a balance on the account and consider setting up NameSilo's
own low-balance notifications.

## 3. Configure GetSawa

Set in your `.env`:

```
NAMESILO_API_KEY=your-key-here
NAMESILO_API_BASE_URL=https://www.namesilo.com/api
NAMESILO_SANDBOX=false
```

NameSilo does not offer a separate sandbox environment for this API — test
with real (cheap, e.g. a throwaway `.xyz`) domains in small quantities before
relying on it for production volume, and use the **Test connection** button
on `/admin/providers`, which calls `getPrices` (a free, non-destructive
operation) to confirm your key works.

## 4. Activate TLDs

`NameSiloProvider` does not hard-code which TLDs are sellable — that's
controlled entirely from `/admin/tlds`. For each TLD you want to sell:

1. Add it in the admin UI.
2. Either let the admin UI's wholesale fields stay blank and set a `FIXED`
   retail price yourself, or fill in NameSilo's current wholesale cost (from
   their pricing page or the `getPrices` API) and use a percentage/fixed
   markup.
3. Activate it.

There is currently no scheduled job that automatically refreshes wholesale
costs from NameSilo (spec section 143's "scheduled refresh" is not built in
Phase 1) — revisit pricing periodically or add that job yourself using the
same `getPricing()` method the "Test connection" button calls.

## Operations used

`checkRegisterAvailability`, `getPrices`, `registerDomain`, `renewDomain`,
`transferDomain`, `checkTransferStatus`, `getDomainInfo`, `listDomains`,
`changeNameServers`, `dnsListRecords`, `dnsAddRecord`, `dnsUpdateRecord`,
`dnsDeleteRecord`, `domainLock`, `domainUnlock`, `addAutoRenewal`,
`removeAutoRenewal`, `addPrivacy`, `removePrivacy`.

These were verified against NameSilo's current published API reference at
the time this was built. NameSilo's API is stable but does change
occasionally — if a call starts failing, check
https://www.namesilo.com/api-reference for the current operation name and
required parameters before assuming the integration code is wrong.
