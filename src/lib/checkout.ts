import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { addCents, clampCents } from "@/lib/money";
import { applyPromotionDiscounts, selectApplicablePromotions, CartItemContext, PromotionContext } from "@/lib/promotions";

export const cartItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DOMAIN_REGISTRATION"),
    domain: z.string().min(3).max(253),
    years: z.number().int().min(1).max(10),
    privacy: z.boolean().optional().default(false),
    autoRenew: z.boolean().optional().default(true),
  }),
  z.object({
    kind: z.literal("DOMAIN_RENEWAL"),
    domainId: z.string(),
    years: z.number().int().min(1).max(10),
  }),
  z.object({
    kind: z.literal("DOMAIN_TRANSFER"),
    domain: z.string().min(3).max(253),
    authCode: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal("PRODUCT"),
    sku: z.string(),
    quantity: z.number().int().min(1).max(20).default(1),
  }),
]);

export const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
  couponCode: z.string().max(50).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface PricedItem {
  kind: "DOMAIN_REGISTRATION" | "DOMAIN_RENEWAL" | "DOMAIN_TRANSFER" | "PRODUCT";
  description: string;
  domain?: string;
  domainId?: string;
  tld?: string;
  years?: number;
  privacy?: boolean;
  autoRenew?: boolean;
  authCode?: string; // transient — only present in-memory for DOMAIN_TRANSFER, never persisted by this function
  productSku?: string;
  productId?: string;
  isPremium?: boolean;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
}

export interface PricedCart {
  items: PricedItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  appliedPromotionId: string | null;
  appliedCouponCode: string | null;
}

/**
 * Recomputes the entire cart from the database. This is the ONLY function
 * allowed to determine what a customer pays — client-submitted prices are
 * never trusted (spec sections 17, 76).
 */
export async function priceCart(input: CheckoutInput, userId: string): Promise<PricedCart> {
  const currency = "USD";
  const items: PricedItem[] = [];

  for (const raw of input.items) {
    if (raw.kind === "DOMAIN_REGISTRATION") {
      const parts = raw.domain.toLowerCase().split(".");
      const ext = parts.slice(1).join(".");
      const tld = await prisma.tld.findUnique({ where: { extension: ext } });
      if (!tld || !tld.isActive) {
        throw new CheckoutError(`.${ext} is not currently available for registration.`);
      }
      const premium = await prisma.premiumDomain.findUnique({ where: { domainName: raw.domain.toLowerCase() } });
      const isPremium = Boolean(premium && premium.status === "LISTED");
      const price = isPremium
        ? { registerCents: premium!.purchasePriceCents, renewCents: premium!.renewalPriceCents }
        : computeTldPrice(tld);

      // Premium acquisition price is a flat one-time figure, not a
      // per-year wholesale rate — it is never multiplied by the requested
      // term the way a standard registration is.
      const unit = isPremium ? price.registerCents : price.registerCents * raw.years;
      items.push({
        kind: "DOMAIN_REGISTRATION",
        description: `${raw.domain} registration — ${raw.years} year${raw.years > 1 ? "s" : ""}`,
        domain: raw.domain.toLowerCase(),
        tld: ext,
        years: raw.years,
        privacy: raw.privacy,
        autoRenew: raw.autoRenew,
        isPremium,
        quantity: 1,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: unit,
      });
    } else if (raw.kind === "DOMAIN_RENEWAL") {
      const domain = await prisma.domain.findUnique({ where: { id: raw.domainId }, include: { tld: true } });
      if (!domain || domain.userId !== userId) {
        throw new CheckoutError("Domain not found in your account.");
      }
      const price = computeTldPrice(domain.tld);
      const unit = price.renewCents * raw.years;
      items.push({
        kind: "DOMAIN_RENEWAL",
        description: `${domain.name} renewal — ${raw.years} year${raw.years > 1 ? "s" : ""}`,
        domain: domain.name,
        domainId: domain.id,
        tld: domain.tld.extension,
        years: raw.years,
        quantity: 1,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: unit,
      });
    } else if (raw.kind === "DOMAIN_TRANSFER") {
      const parts = raw.domain.toLowerCase().split(".");
      const ext = parts.slice(1).join(".");
      const tld = await prisma.tld.findUnique({ where: { extension: ext } });
      if (!tld || !tld.isActive) {
        throw new CheckoutError(`.${ext} is not currently available.`);
      }
      const price = computeTldPrice(tld);
      if (price.transferCents == null) {
        throw new CheckoutError(`Transfers are not currently available for .${ext} domains.`);
      }
      items.push({
        kind: "DOMAIN_TRANSFER",
        description: `${raw.domain.toLowerCase()} transfer`,
        domain: raw.domain.toLowerCase(),
        tld: ext,
        authCode: raw.authCode,
        quantity: 1,
        unitPriceCents: price.transferCents,
        discountCents: 0,
        totalCents: price.transferCents,
      });
    } else if (raw.kind === "PRODUCT") {
      const product = await prisma.product.findUnique({ where: { sku: raw.sku } });
      if (!product || product.status !== "ACTIVE") {
        throw new CheckoutError(`This product is not currently available.`);
      }
      const unit = product.retailPriceCents;
      const total = unit * raw.quantity;
      items.push({
        kind: "PRODUCT",
        description: product.name,
        productSku: product.sku,
        productId: product.id,
        quantity: raw.quantity,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: total,
      });
    }
  }

  // ---- Promotions -----------------------------------------------------------
  const priorOrderCount = await prisma.order.count({ where: { userId, status: { in: ["ACTIVE", "PAYMENT_CONFIRMED", "PROVISIONING"] } } });
  const promoContext: PromotionContext = {
    isNewCustomer: priorOrderCount === 0,
    cart: items.map((item, idx) => ({
      id: String(idx),
      kind: item.kind,
      tld: item.tld,
      productSku: item.productSku,
      isPremium: item.isPremium,
      years: item.years,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
    })) as CartItemContext[],
  };

  const activePromotions = await prisma.promotion.findMany({ where: { isActive: true } });
  const applicable = selectApplicablePromotions(activePromotions, promoContext);
  let appliedPromotionId: string | null = null;

  for (const promo of applicable) {
    const discounts = applyPromotionDiscounts(promo, promoContext);
    for (const d of discounts) {
      const idx = Number(d.itemId);
      const item = items[idx];
      if (!item) continue;
      item.discountCents = clampCents(item.discountCents + d.discountCents);
      item.totalCents = clampCents(item.unitPriceCents * item.quantity - item.discountCents);
    }
    if (discounts.length > 0) appliedPromotionId = promo.id;
  }

  // ---- Coupon -----------------------------------------------------------------
  let appliedCouponCode: string | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!coupon || !coupon.isActive) {
      throw new CheckoutError("This coupon code is not valid.");
    }
    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) throw new CheckoutError("This coupon is not active yet.");
    if (coupon.endsAt && now > coupon.endsAt) throw new CheckoutError("This coupon has expired.");
    if (coupon.usageLimit && coupon.timesUsed >= coupon.usageLimit) throw new CheckoutError("This coupon has reached its usage limit.");
    if (coupon.newCustomerOnly && priorOrderCount > 0) throw new CheckoutError("This coupon is for new customers only.");

    const subtotal = addCents(...items.map((i) => i.totalCents));
    if (coupon.minOrderCents && subtotal < coupon.minOrderCents) {
      throw new CheckoutError(`This coupon requires a minimum order of ${(coupon.minOrderCents / 100).toFixed(2)}.`);
    }

    let couponDiscount = 0;
    if (coupon.discountType === "PERCENT") {
      couponDiscount = Math.round((subtotal * coupon.discountValue) / 100);
    } else if (coupon.discountType === "FIXED") {
      couponDiscount = coupon.discountValue;
    }
    if (coupon.maxDiscountCents) couponDiscount = Math.min(couponDiscount, coupon.maxDiscountCents);
    couponDiscount = Math.min(couponDiscount, subtotal);

    // Spread coupon discount proportionally across items.
    let remaining = couponDiscount;
    items.forEach((item, i) => {
      if (item.totalCents <= 0) return;
      const share = i === items.length - 1 ? remaining : Math.round((item.totalCents / subtotal) * couponDiscount);
      const applied = Math.min(share, item.totalCents, remaining);
      item.discountCents += applied;
      item.totalCents -= applied;
      remaining -= applied;
    });

    appliedCouponCode = coupon.code;
  }

  const subtotalCents = addCents(...items.map((i) => i.unitPriceCents * i.quantity));
  const discountCents = addCents(...items.map((i) => i.discountCents));
  const totalCents = clampCents(subtotalCents - discountCents);

  return { items, subtotalCents, discountCents, totalCents, currency, appliedPromotionId, appliedCouponCode };
}

export class CheckoutError extends Error {}
