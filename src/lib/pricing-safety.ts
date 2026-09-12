import { clampCents } from "@/lib/money";

export interface MarkupTier {
  minWholesaleCents: number;
  maxWholesaleCents: number | null;
  markupPercent: number;
  minimumMarkupCents: number;
}

export interface PricingSafetyPolicy {
  paymentFeePercent: number;
  paymentFixedFeeCents: number;
  fxBufferPercent: number;
  minimumProfitCents: number;
  minimumMarginPercent: number;
  markupTiers: MarkupTier[];
}

export interface SafeRetailBreakdown {
  wholesaleCents: number;
  wholesaleWithFxBufferCents: number;
  fxReserveCents: number;
  markupPercent: number;
  targetMarkupCents: number;
  estimatedPaymentFeeCents: number;
  minimumProfitCents: number;
  minimumMarginProfitCents: number;
  retailCents: number;
  estimatedProfitCents: number;
}

/**
 * Conservative defaults. They can be replaced at runtime from the
 * `commerce.pricing_policy` SystemSetting without changing source code.
 *
 * These are safeguards, not claims about the exact fee charged by a given
 * payment processor. Admins should configure the real blended payment cost
 * once the live acquiring contract is known.
 */
export const DEFAULT_PRICING_SAFETY_POLICY: PricingSafetyPolicy = {
  paymentFeePercent: 4,
  paymentFixedFeeCents: 50,
  fxBufferPercent: 1.5,
  minimumProfitCents: 250,
  minimumMarginPercent: 10,
  markupTiers: [
    { minWholesaleCents: 0, maxWholesaleCents: 2_000, markupPercent: 25, minimumMarkupCents: 300 },
    { minWholesaleCents: 2_001, maxWholesaleCents: 10_000, markupPercent: 20, minimumMarkupCents: 300 },
    { minWholesaleCents: 10_001, maxWholesaleCents: 50_000, markupPercent: 15, minimumMarkupCents: 500 },
    { minWholesaleCents: 50_001, maxWholesaleCents: 100_000, markupPercent: 10, minimumMarkupCents: 1_000 },
    { minWholesaleCents: 100_001, maxWholesaleCents: 500_000, markupPercent: 7, minimumMarkupCents: 2_500 },
    { minWholesaleCents: 500_001, maxWholesaleCents: 1_000_000, markupPercent: 5, minimumMarkupCents: 5_000 },
    { minWholesaleCents: 1_000_001, maxWholesaleCents: null, markupPercent: 3, minimumMarkupCents: 10_000 },
  ],
};

function percentageOf(cents: number, percent: number): number {
  return Math.ceil((cents * Math.max(0, percent)) / 100);
}

export function validatePricingSafetyPolicy(policy: PricingSafetyPolicy): PricingSafetyPolicy {
  if (!Number.isFinite(policy.paymentFeePercent) || policy.paymentFeePercent < 0 || policy.paymentFeePercent >= 100) {
    throw new Error("paymentFeePercent must be between 0 and 100.");
  }
  if (!Number.isFinite(policy.fxBufferPercent) || policy.fxBufferPercent < 0 || policy.fxBufferPercent >= 100) {
    throw new Error("fxBufferPercent must be between 0 and 100.");
  }
  if (!Number.isFinite(policy.minimumMarginPercent) || policy.minimumMarginPercent < 0 || policy.minimumMarginPercent >= 100) {
    throw new Error("minimumMarginPercent must be between 0 and 100.");
  }
  if (!Number.isInteger(policy.paymentFixedFeeCents) || policy.paymentFixedFeeCents < 0) {
    throw new Error("paymentFixedFeeCents must be a non-negative integer.");
  }
  if (!Number.isInteger(policy.minimumProfitCents) || policy.minimumProfitCents < 0) {
    throw new Error("minimumProfitCents must be a non-negative integer.");
  }
  if (!Array.isArray(policy.markupTiers) || policy.markupTiers.length === 0) {
    throw new Error("At least one markup tier is required.");
  }

  const tiers = [...policy.markupTiers].sort((a, b) => a.minWholesaleCents - b.minWholesaleCents);
  let expectedMin = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i];
    if (!tier) throw new Error("Markup tier configuration is incomplete.");

    if (!Number.isInteger(tier.minWholesaleCents) || tier.minWholesaleCents < 0) {
      throw new Error("Markup tier minimums must be non-negative integer cents.");
    }
    if (tier.minWholesaleCents > expectedMin) {
      throw new Error("Markup tiers must not leave wholesale-price gaps.");
    }
    if (tier.maxWholesaleCents != null && tier.maxWholesaleCents < tier.minWholesaleCents) {
      throw new Error("Markup tier maximum cannot be below its minimum.");
    }
    if (!Number.isFinite(tier.markupPercent) || tier.markupPercent < 0) {
      throw new Error("Markup percentages must be non-negative.");
    }
    if (!Number.isInteger(tier.minimumMarkupCents) || tier.minimumMarkupCents < 0) {
      throw new Error("Minimum markup must be non-negative integer cents.");
    }
    if (tier.maxWholesaleCents == null && i !== tiers.length - 1) {
      throw new Error("Only the final markup tier may have no maximum.");
    }
    if (tier.maxWholesaleCents != null) expectedMin = tier.maxWholesaleCents + 1;
  }

  const firstTier = tiers[0];
  const lastTier = tiers[tiers.length - 1];
  if (!firstTier || !lastTier) {
    throw new Error("At least one markup tier is required.");
  }
  if (firstTier.minWholesaleCents !== 0 || lastTier.maxWholesaleCents !== null) {
    throw new Error("Markup tiers must cover the full range from zero with an open-ended final tier.");
  }

  return { ...policy, markupTiers: tiers };
}

export function selectMarkupTier(wholesaleCents: number, policy: PricingSafetyPolicy): MarkupTier {
  const wholesale = clampCents(wholesaleCents);
  const validated = validatePricingSafetyPolicy(policy);
  const tier = validated.markupTiers.find(
    (candidate) =>
      wholesale >= candidate.minWholesaleCents &&
      (candidate.maxWholesaleCents == null || wholesale <= candidate.maxWholesaleCents),
  );
  if (!tier) throw new Error(`No markup tier covers wholesale cost ${wholesale}.`);
  return tier;
}

/**
 * Calculates a selling price that protects wholesale cost, an FX reserve,
 * desired/tier markup and the configured payment-processing cost.
 *
 * The processor percentage is grossed up instead of simply added. If a
 * processor charges p% of the retail amount, the equation is:
 * retail = (cost + required profit + fixed fee) / (1 - p)
 */
export function computeSafeRetailPrice(
  wholesaleCents: number,
  policy: PricingSafetyPolicy = DEFAULT_PRICING_SAFETY_POLICY,
): SafeRetailBreakdown {
  const wholesale = clampCents(wholesaleCents);
  const validated = validatePricingSafetyPolicy(policy);
  const tier = selectMarkupTier(wholesale, validated);

  const fxReserveCents = percentageOf(wholesale, validated.fxBufferPercent);
  const bufferedWholesale = wholesale + fxReserveCents;
  const tierMarkupCents = Math.max(
    tier.minimumMarkupCents,
    percentageOf(bufferedWholesale, tier.markupPercent),
  );
  const marginProfitCents = percentageOf(bufferedWholesale, validated.minimumMarginPercent);
  const requiredProfitCents = Math.max(
    validated.minimumProfitCents,
    marginProfitCents,
    tierMarkupCents,
  );

  const percentageFraction = validated.paymentFeePercent / 100;
  const preProcessorRequired = bufferedWholesale + requiredProfitCents + validated.paymentFixedFeeCents;
  const retailCents = clampCents(Math.ceil(preProcessorRequired / (1 - percentageFraction)));
  const estimatedPaymentFeeCents =
    percentageOf(retailCents, validated.paymentFeePercent) + validated.paymentFixedFeeCents;
  const estimatedProfitCents = retailCents - estimatedPaymentFeeCents - bufferedWholesale;

  if (estimatedProfitCents < requiredProfitCents) {
    // Rounding can leave us one cent short; close the gap defensively.
    return computeSafeRetailPriceWithFloor(wholesale, retailCents + (requiredProfitCents - estimatedProfitCents), validated);
  }

  return {
    wholesaleCents: wholesale,
    wholesaleWithFxBufferCents: bufferedWholesale,
    fxReserveCents,
    markupPercent: tier.markupPercent,
    targetMarkupCents: tierMarkupCents,
    estimatedPaymentFeeCents,
    minimumProfitCents: validated.minimumProfitCents,
    minimumMarginProfitCents: marginProfitCents,
    retailCents,
    estimatedProfitCents,
  };
}

function computeSafeRetailPriceWithFloor(
  wholesaleCents: number,
  requestedRetailCents: number,
  policy: PricingSafetyPolicy,
): SafeRetailBreakdown {
  const wholesale = clampCents(wholesaleCents);
  const tier = selectMarkupTier(wholesale, policy);
  const fxReserveCents = percentageOf(wholesale, policy.fxBufferPercent);
  const bufferedWholesale = wholesale + fxReserveCents;
  const tierMarkupCents = Math.max(tier.minimumMarkupCents, percentageOf(bufferedWholesale, tier.markupPercent));
  const marginProfitCents = percentageOf(bufferedWholesale, policy.minimumMarginPercent);
  const requiredProfitCents = Math.max(policy.minimumProfitCents, marginProfitCents, tierMarkupCents);

  let retailCents = clampCents(requestedRetailCents);
  for (let i = 0; i < 20; i += 1) {
    const fee = percentageOf(retailCents, policy.paymentFeePercent) + policy.paymentFixedFeeCents;
    const profit = retailCents - fee - bufferedWholesale;
    if (profit >= requiredProfitCents) {
      return {
        wholesaleCents: wholesale,
        wholesaleWithFxBufferCents: bufferedWholesale,
        fxReserveCents,
        markupPercent: tier.markupPercent,
        targetMarkupCents: tierMarkupCents,
        estimatedPaymentFeeCents: fee,
        minimumProfitCents: policy.minimumProfitCents,
        minimumMarginProfitCents: marginProfitCents,
        retailCents,
        estimatedProfitCents: profit,
      };
    }
    retailCents += requiredProfitCents - profit;
  }
  throw new Error("Unable to calculate a safe retail price.");
}

/** Returns the minimum retail amount allowed for this wholesale cost. */
export function minimumSafeRetailCents(
  wholesaleCents: number,
  policy: PricingSafetyPolicy = DEFAULT_PRICING_SAFETY_POLICY,
): number {
  return computeSafeRetailPrice(wholesaleCents, policy).retailCents;
}

/**
 * Enforces the anti-loss invariant after coupons/promotions/custom pricing.
 * Deliberate loss leaders must use a future separately-authorized subsidy
 * mechanism; ordinary promotions are never allowed to cross this floor.
 */
export function enforceRetailFloor(
  proposedRetailCents: number,
  wholesaleCents: number,
  policy: PricingSafetyPolicy = DEFAULT_PRICING_SAFETY_POLICY,
): number {
  return Math.max(clampCents(proposedRetailCents), minimumSafeRetailCents(wholesaleCents, policy));
}
