# Phase 31 verification — post-launch resilience and provider expansion

Status: roadmap architecture complete. Secondary providers and new regional payment/currency/localization capabilities remain intentionally disabled until individually implemented and accepted.

## Implemented

- Central provider routing policy with explicit primary/secondary configuration and an implemented-adapter allow-list.
- Fail-closed rejection of provider names that do not have real adapters.
- Capability-scoped automatic failover guard requiring two distinct implemented adapters plus an approval identifier.
- Shared payment-provider contract and factory seam while preserving PayPal as the current implementation.
- Domain provider factory upgraded from hard-coded construction to validated provider selection.
- Operational provider-resilience checker wired into the final launch-readiness check.
- Currency and locale configuration validation with USD/English baseline preservation.
- Secondary registrar/payment onboarding requirements, premium-price safety, reconciliation rules and market-expansion gates.

## Current resilience truth

There is still one implemented provider per high-risk capability. Therefore cross-provider automatic failover is **not enabled** and should fail configuration validation if requested. This is correct production behavior; inventing a second provider would violate the roadmap's provider-truth rules.

## Static verification completed — 13 September 2026

- `node --check scripts/ops/check-provider-resilience.mjs` passes for the committed script content.
- Default/current provider selection passes the resilience checker.
- Configuring `PAYMENT_SECONDARY_PROVIDER=stripe` is rejected because no Stripe adapter exists.
- Requesting automatic payment failover without a distinct implemented secondary provider is rejected and also requires a failover approval ID.
- An unknown automatic-failover capability is rejected.
- Existing NameSilo routing remains the default through `getDomainProvider()` and the factory now validates that selection before construction.
- PayPal retains its existing methods and is explicitly identified as the `paypal` implementation for the shared payment-provider contract/factory.
- No customer-facing copy claims secondary registrar, local payment method, extra currency or localization support.

## Runtime/build gate

A full Next.js/OpenNext/Cloudflare build is still an external runtime gate because the isolated local environment cannot install the repository dependency graph and GitHub Actions allowance is exhausted. Phase 31 introduces no claim that such a runtime deployment has already passed.

Future provider additions are post-roadmap operational/product increments and must follow `PROVIDER_ONBOARDING_CHECKLIST.md` plus Phase 30 acceptance discipline.
