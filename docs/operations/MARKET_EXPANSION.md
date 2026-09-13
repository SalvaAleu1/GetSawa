# Multi-currency, localization and market expansion

GetSawa may expand beyond its initial USD/English operating baseline, but configuration alone must never imply commercial support.

## Currency admission gate

`GETSAWA_SUPPORTED_CURRENCIES` is an operational allow-list only. Adding `KES`, `UGX`, `SSP`, `TZS` or another ISO currency code requires all of the following before customer checkout uses it:

- payment provider can accept the currency for GetSawa's actual merchant account;
- settlement/FX economics and fees are known;
- registrar/provider wholesale currency conversion has an authoritative rate source and reserve policy;
- refund, dispute, invoice and accounting behavior is defined;
- rounding/minor-unit rules are tested;
- pricing-floor logic cannot create a loss after FX/provider fees.

Until then, keep checkout currency behavior on the already supported path. Never hard-code a favorable FX rate to make a market appear supported.

## Localization admission gate

`GETSAWA_SUPPORTED_LOCALES` records approved application locales. A locale is public only after navigation, checkout, account/security, support and legal/policy content have been reviewed in that language. Machine translation alone is not legal-policy approval.

English remains the canonical fallback. Locale selection must not alter authoritative prices, domain/provider status or security decisions.

## Regional launch checklist

For each country/market record: supported products, customer/merchant legal basis, payment method and settlement, currencies, taxes/invoicing requirements, domain/TLD eligibility, support hours/channel, data/privacy requirements, provider restrictions, refund/dispute handling and a rollback/disable mechanism.
