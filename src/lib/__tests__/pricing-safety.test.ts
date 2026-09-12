import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_SAFETY_POLICY,
  computeSafeRetailPrice,
  enforceRetailFloor,
  minimumSafeRetailCents,
  validatePricingSafetyPolicy,
} from "@/lib/pricing-safety";

describe("pricing safety engine", () => {
  it("grosses up a $10,000 wholesale premium price instead of selling at a normal TLD price", () => {
    const wholesale = 1_000_000;
    const result = computeSafeRetailPrice(wholesale);

    expect(result.retailCents).toBeGreaterThan(wholesale);
    expect(result.estimatedProfitCents).toBeGreaterThanOrEqual(result.targetMarkupCents);
    expect(result.estimatedProfitCents).toBeGreaterThanOrEqual(result.minimumProfitCents);
  });

  it("never lets a promotion push a domain below its safe retail floor", () => {
    const wholesale = 1_105; // representative standard-domain wholesale price
    const floor = minimumSafeRetailCents(wholesale);
    expect(enforceRetailFloor(1, wholesale)).toBe(floor);
    expect(enforceRetailFloor(floor + 500, wholesale)).toBe(floor + 500);
  });

  it("includes payment fees and FX reserve in the protected economics", () => {
    const result = computeSafeRetailPrice(2_000);
    expect(result.fxReserveCents).toBeGreaterThan(0);
    expect(result.estimatedPaymentFeeCents).toBeGreaterThan(0);
    expect(result.retailCents - result.estimatedPaymentFeeCents - result.wholesaleWithFxBufferCents)
      .toBe(result.estimatedProfitCents);
  });

  it("rejects policies with pricing gaps", () => {
    expect(() => validatePricingSafetyPolicy({
      ...DEFAULT_PRICING_SAFETY_POLICY,
      markupTiers: [
        { minWholesaleCents: 0, maxWholesaleCents: 1000, markupPercent: 10, minimumMarkupCents: 100 },
        { minWholesaleCents: 1002, maxWholesaleCents: null, markupPercent: 5, minimumMarkupCents: 100 },
      ],
    })).toThrow(/must not leave wholesale-price gaps/i);
  });
});
