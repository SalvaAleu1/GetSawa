import { describe, it, expect } from "vitest";
import { computeTldPrice } from "@/lib/pricing";

// Minimal Tld-shaped fixtures — only the fields computeTldPrice reads.
function tldFixture(overrides: Partial<any> = {}) {
  return {
    id: "tld_1",
    extension: "com",
    isActive: true,
    isFeatured: false,
    supportsPrivacy: false,
    supportsPremium: true,
    minYears: 1,
    maxYears: 10,
    promotionEligible: true,
    pricingMethod: "WHOLESALE_PLUS_PERCENT",
    wholesaleRegisterCents: 950,
    wholesaleRenewCents: 1050,
    wholesaleTransferCents: 900,
    fixedRegisterCents: null,
    fixedRenewCents: null,
    fixedTransferCents: null,
    markupFixedCents: null,
    markupPercent: null,
    currency: "USD",
    wholesaleUpdatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("computeTldPrice", () => {
  it("computes wholesale + percent markup correctly", () => {
    const tld = tldFixture({ markupPercent: 25 as any });
    const price = computeTldPrice(tld as any);
    expect(price.registerCents).toBe(950 + Math.round(950 * 0.25)); // 1188
    expect(price.renewCents).toBe(1050 + Math.round(1050 * 0.25)); // 1313
  });

  it("computes wholesale + fixed markup correctly", () => {
    const tld = tldFixture({ pricingMethod: "WHOLESALE_PLUS_FIXED", markupFixedCents: 500 });
    const price = computeTldPrice(tld as any);
    expect(price.registerCents).toBe(950 + 500);
    expect(price.renewCents).toBe(1050 + 500);
  });

  it("uses fixed price directly when pricingMethod is FIXED", () => {
    const tld = tldFixture({ pricingMethod: "FIXED", fixedRegisterCents: 1499, fixedRenewCents: 1799 });
    const price = computeTldPrice(tld as any);
    expect(price.registerCents).toBe(1499);
    expect(price.renewCents).toBe(1799);
  });

  it("never produces a negative price", () => {
    const tld = tldFixture({ wholesaleRegisterCents: 0, markupPercent: 0 as any });
    const price = computeTldPrice(tld as any);
    expect(price.registerCents).toBeGreaterThanOrEqual(0);
  });
});
