# Hosting & Business Email — extension points

Unlike domains (NameSilo) and payments (PayPal), the original spec did not
name a specific hosting or business-email vendor. Faking an integration
against an unspecified vendor would violate the platform's core rule (never
let a UI feature exist without the backend that makes it real), so instead
this codebase ships the same **provider interface pattern** used for domains
and payments, ready for a real implementation:

- `src/lib/providers/hosting/HostingProvider.ts`
- `src/lib/providers/email/EmailProvider.ts`

Both currently resolve to an `Unconfigured*Provider` that reports
`isConfigured() === false` and returns a clear failure message if called.
This means:

- `/admin/providers` shows Hosting and Business Email as "Not configured".
- The product-activation workflow (`/api/admin/products/[id]`, `PUT` with
  `{ status: "ACTIVE" }`) refuses to activate a product whose
  `providerName` is `"hosting"` or `"email"` — it returns a 409 explaining
  why, exactly like it does for NameSilo/PayPal/AI when those aren't
  configured.
- If an order somehow contains one of these products anyway (e.g. was
  active before being paused), `lib/provisioning.ts` marks that order item
  `FAILED` with an explanation rather than pretending to deliver it.

## Implementing a real hosting provider

1. Pick a vendor with a real API — a cPanel/WHM reseller API, Plesk, a
   cloud host's account-provisioning API, etc.
2. Implement `HostingProvider` (`provisionAccount`, `suspendAccount`,
   `unsuspendAccount`, `terminateAccount`) against that vendor's API,
   following the same pattern as `NameSiloProvider.ts` — real HTTP calls,
   normalized result types, no fabricated success states.
3. Add the corresponding env vars (`HOSTING_API_KEY`, `HOSTING_API_BASE_URL`
   are already reserved in `.env.example`).
4. Point `getHostingProvider()` at your new class.
5. Extend `lib/provisioning.ts`'s non-domain branch to call
   `getHostingProvider().provisionAccount(...)` when `product.provisioningMethod === "hosting"`,
   store the result (you'll want a `HostingAccount` model — not yet in the
   schema, since there's nothing to provision against it yet), and send the
   customer their access details the same way `provisionDomainRegistration`
   sends a confirmation email.

The same steps apply to `EmailProvider` for business email.

## Why this is the honest choice

Building a "hosting" feature against no real backend — even one that looks
polished — is exactly the failure mode section 183 of the original spec
calls out: a button that says "Buy Hosting" but doesn't actually provision
anything. Shipping the interface and the gating logic, without the fake
implementation, means a real integration can be dropped in later without
anyone having to first find and rip out something that only pretended to
work.
