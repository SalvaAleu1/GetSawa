# Phase 31 verification — post-launch resilience and provider expansion

Status: roadmap architecture complete. Secondary providers and new regional payment/currency/localization capabilities remain intentionally disabled until individually implemented and accepted.

## Implemented

- Central provider routing policy with explicit primary/secondary configuration and an implemented-adapter allow-list.
- Fail-closed rejection of provider names that do not have real adapters.
- Automatic failover guard requiring two distinct implemented adapters plus an approval identifier.
- Shared payment-provider contract and factory seam while preserving PayPal as the current implementation.
- Domain provider factory upgraded from hard-coded construction to validated provider selection.
- Operational provider-resilience checker.
- Currency and locale configuration validation with USD/English baseline preservation.
- Secondary registrar/payment onboarding requirements, premium-price safety, reconciliation rules and market-expansion gates.

## Current resilience truth

There is still one implemented provider per high-risk capability. Therefore cross-provider automatic failover is **not enabled** and should fail configuration validation if requested. This is correct production behavior; inventing a second provider would violate the roadmap's provider-truth rules.

## Verification gate

Before merging Phase 31:

1. `node scripts/ops/check-provider-resilience.mjs` passes with default/current provider configuration.
2. The same checker fails when an unimplemented secondary provider is configured.
3. The same checker fails when automatic failover is requested without a distinct implemented secondary provider and approval ID.
4. Existing NameSilo domain selection still resolves through `getDomainProvider()`.
5. Existing PayPal implementation still satisfies the new payment-provider contract/factory.
6. No customer-facing copy claims secondary registrar, local payment method, extra currency or localization support.

Future provider additions are post-roadmap operational/product increments and must follow `PROVIDER_ONBOARDING_CHECKLIST.md` plus Phase 30 acceptance discipline.
