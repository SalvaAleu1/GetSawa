import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";

export type MarketplaceEconomicSource = "GETSAWA_INVENTORY" | "CUSTOMER_CUSTODY";

export async function validatePremiumMarketplaceEconomics(params: {
  source: MarketplaceEconomicSource;
  salePriceCents: number;
  acquisitionCostCents?: number | null;
  commissionBps?: number;
}) {
  const salePrice = Math.round(params.salePriceCents);
  if (!Number.isInteger(salePrice) || salePrice <= 0) throw new Error("A valid sale price is required.");
  const policy = await getPricingSafetyPolicy();

  if (params.source === "GETSAWA_INVENTORY") {
    if (params.acquisitionCostCents == null) throw new Error("GetSawa-owned inventory requires an acquisition cost.");
    const minimumSaleCents = computeSafeRetailPrice(params.acquisitionCostCents, policy).retailCents;
    if (salePrice < minimumSaleCents) {
      throw new Error(`This price is below the protected minimum of ${(minimumSaleCents / 100).toFixed(2)} USD.`);
    }
    return {
      minimumSaleCents,
      platformRevenueCents: salePrice - params.acquisitionCostCents,
      estimatedPaymentFeeCents: Math.ceil(salePrice * policy.paymentFeePercent / 100) + policy.paymentFixedFeeCents,
    };
  }

  const commissionBps = Math.round(params.commissionBps ?? 0);
  if (commissionBps <= 0 || commissionBps > 10000) throw new Error("A valid marketplace commission is required.");
  const platformRevenueCents = Math.floor(salePrice * commissionBps / 10000);
  const estimatedPaymentFeeCents = Math.ceil(salePrice * policy.paymentFeePercent / 100) + policy.paymentFixedFeeCents;
  const minimumMarginProfitCents = Math.ceil(salePrice * policy.minimumMarginPercent / 100);
  const requiredNetProfitCents = Math.max(policy.minimumProfitCents, minimumMarginProfitCents);
  const estimatedNetProfitCents = platformRevenueCents - estimatedPaymentFeeCents;

  if (estimatedNetProfitCents < requiredNetProfitCents) {
    const commissionFraction = commissionBps / 10000;
    const feeFraction = policy.paymentFeePercent / 100;
    const marginFraction = policy.minimumMarginPercent / 100;
    const denominator = commissionFraction - feeFraction - marginFraction;
    const fixedRequirement = policy.paymentFixedFeeCents + policy.minimumProfitCents;
    const minimumSaleCents = denominator > 0 ? Math.ceil(fixedRequirement / denominator) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(minimumSaleCents)) throw new Error("The configured marketplace commission is too low to cover payment costs and the minimum platform margin.");
    throw new Error(`This price is below the protected marketplace minimum of ${(minimumSaleCents / 100).toFixed(2)} USD at the current commission.`);
  }

  return {
    minimumSaleCents: salePrice,
    platformRevenueCents,
    estimatedPaymentFeeCents,
    estimatedNetProfitCents,
  };
}
