import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PRICING_SAFETY_POLICY,
  PricingSafetyPolicy,
  validatePricingSafetyPolicy,
} from "@/lib/pricing-safety";

export const PRICING_POLICY_SETTING_KEY = "commerce.pricing_policy";

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

export function parsePricingSafetyPolicy(value: unknown): PricingSafetyPolicy {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const defaultPolicy = DEFAULT_PRICING_SAFETY_POLICY;
  const rawTiers = Array.isArray(candidate.markupTiers) ? candidate.markupTiers : defaultPolicy.markupTiers;

  const policy: PricingSafetyPolicy = {
    paymentFeePercent: numberOr(candidate.paymentFeePercent, defaultPolicy.paymentFeePercent),
    paymentFixedFeeCents: integerOr(candidate.paymentFixedFeeCents, defaultPolicy.paymentFixedFeeCents),
    fxBufferPercent: numberOr(candidate.fxBufferPercent, defaultPolicy.fxBufferPercent),
    minimumProfitCents: integerOr(candidate.minimumProfitCents, defaultPolicy.minimumProfitCents),
    minimumMarginPercent: numberOr(candidate.minimumMarginPercent, defaultPolicy.minimumMarginPercent),
    markupTiers: rawTiers.map((raw, index) => {
      const fallback = defaultPolicy.markupTiers[Math.min(index, defaultPolicy.markupTiers.length - 1)];
      const tier = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return {
        minWholesaleCents: integerOr(tier.minWholesaleCents, fallback.minWholesaleCents),
        maxWholesaleCents:
          tier.maxWholesaleCents === null
            ? null
            : integerOr(tier.maxWholesaleCents, fallback.maxWholesaleCents ?? 0),
        markupPercent: numberOr(tier.markupPercent, fallback.markupPercent),
        minimumMarkupCents: integerOr(tier.minimumMarkupCents, fallback.minimumMarkupCents),
      };
    }),
  };

  return validatePricingSafetyPolicy(policy);
}

export async function getPricingSafetyPolicy(): Promise<PricingSafetyPolicy> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: PRICING_POLICY_SETTING_KEY },
    select: { value: true },
  });

  if (!setting) return DEFAULT_PRICING_SAFETY_POLICY;
  try {
    return parsePricingSafetyPolicy(setting.value);
  } catch (error) {
    console.error("Invalid commerce pricing policy; falling back to safe defaults.", error);
    return DEFAULT_PRICING_SAFETY_POLICY;
  }
}

export async function savePricingSafetyPolicy(policy: PricingSafetyPolicy): Promise<PricingSafetyPolicy> {
  const validated = validatePricingSafetyPolicy(policy);
  await prisma.systemSetting.upsert({
    where: { key: PRICING_POLICY_SETTING_KEY },
    update: { value: validated as any },
    create: { key: PRICING_POLICY_SETTING_KEY, value: validated as any },
  });
  return validated;
}
