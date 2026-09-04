import { describe, it, expect } from "vitest";
import { isPromotionEligible, applyPromotionDiscounts, selectApplicablePromotions } from "@/lib/promotions";

function promoFixture(overrides: Partial<any> = {}) {
  return {
    id: "promo_1",
    name: "Launch offer",
    description: null,
    isActive: true,
    rules: {
      conditionLogic: "AND",
      conditions: [{ field: "customer.isNew", op: "eq", value: true }],
      effects: [{ type: "FREE_ITEM", targetKind: "DOMAIN_REGISTRATION", targetTlds: ["com"], excludePremium: true }],
    },
    priority: 10,
    isStackable: false,
    isExclusive: false,
    maxDiscountCents: null,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("promotion engine", () => {
  it("is eligible for new customers and not for returning customers", () => {
    const promo = promoFixture();
    expect(isPromotionEligible(promo as any, { isNewCustomer: true, cart: [] })).toBe(true);
    expect(isPromotionEligible(promo as any, { isNewCustomer: false, cart: [] })).toBe(false);
  });

  it("applies a free-item discount only to matching, non-premium .com registrations", () => {
    const promo = promoFixture();
    const ctx = {
      isNewCustomer: true,
      cart: [
        { id: "0", kind: "DOMAIN_REGISTRATION" as const, tld: "com", isPremium: false, unitPriceCents: 1200, quantity: 1 },
        { id: "1", kind: "DOMAIN_REGISTRATION" as const, tld: "com", isPremium: true, unitPriceCents: 50000, quantity: 1 },
        { id: "2", kind: "DOMAIN_REGISTRATION" as const, tld: "net", isPremium: false, unitPriceCents: 1000, quantity: 1 },
      ],
    };
    const discounts = applyPromotionDiscounts(promo as any, ctx);
    expect(discounts).toEqual([{ itemId: "0", discountCents: 1200 }]);
  });

  it("excludes premium domains from a free-domain promotion by default", () => {
    const promo = promoFixture();
    const ctx = {
      isNewCustomer: true,
      cart: [{ id: "0", kind: "DOMAIN_REGISTRATION" as const, tld: "com", isPremium: true, unitPriceCents: 99999, quantity: 1 }],
    };
    expect(applyPromotionDiscounts(promo as any, ctx)).toEqual([]);
  });

  it("selects only the highest-priority non-stackable promotion", () => {
    const low = promoFixture({ id: "low", priority: 1 });
    const high = promoFixture({ id: "high", priority: 100 });
    const selected = selectApplicablePromotions([low, high] as any, { isNewCustomer: true, cart: [] });
    expect(selected.map((p) => p.id)).toEqual(["high"]);
  });

  it("caps total discount at maxDiscountCents when set", () => {
    const promo = promoFixture({
      maxDiscountCents: 500,
      rules: {
        conditionLogic: "AND",
        conditions: [],
        effects: [{ type: "FIXED_OFF_ITEM", targetKind: "DOMAIN_REGISTRATION", amountCents: 1000 }],
      },
    });
    const ctx = {
      isNewCustomer: true,
      cart: [
        { id: "0", kind: "DOMAIN_REGISTRATION" as const, tld: "com", unitPriceCents: 2000, quantity: 1 },
        { id: "1", kind: "DOMAIN_REGISTRATION" as const, tld: "net", unitPriceCents: 2000, quantity: 1 },
      ],
    };
    const discounts = applyPromotionDiscounts(promo as any, ctx);
    const total = discounts.reduce((s, d) => s + d.discountCents, 0);
    expect(total).toBeLessThanOrEqual(500);
  });
});
