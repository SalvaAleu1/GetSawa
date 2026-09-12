import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { addCents, clampCents } from "@/lib/money";
import { applyPromotionDiscounts, selectApplicablePromotions, CartItemContext, PromotionContext } from "@/lib/promotions";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice, enforceRetailFloor } from "@/lib/pricing-safety";
import { fetchLiveWholesalePricing } from "@/lib/domain-pricing-sync";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";

export const DOMAIN_QUOTE_TTL_MS = 10 * 60 * 1000;

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
  /** Minimum amount this line may be reduced to without violating cost/margin safeguards. */
  minimumTotalCents?: number;
  /** Provider cost snapshot used to calculate the margin floor. */
  wholesaleCostCents?: number;
  pricingSource?: string;
}

export interface PricedCart {
  items: PricedItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  appliedPromotionId: string | null;
  appliedCouponCode: string | null;
  quotedAt: string;
  quoteExpiresAt: string;
}

function applyItemMarginFloors(items: PricedItem[]) {
  for (const item of items) {
    if (item.minimumTotalCents == null) continue;
    const full = item.unitPriceCents * item.quantity;
    const floor = Math.min(full, item.minimumTotalCents);
    if (item.totalCents >= floor) continue;
    item.totalCents = floor;
    item.discountCents = Math.max(0, full - floor);
  }
}

/**
 * Recomputes the entire cart from authoritative server-side sources. Domain
 * transactions use a fresh registrar wholesale snapshot, then GetSawa's
 * pricing safety policy is applied before any promotion or coupon.
 */
export async function priceCart(input: CheckoutInput, userId: string): Promise<PricedCart> {
  const currency = "USD";
  const items: PricedItem[] = [];
  const quotedAt = new Date();
  const quoteExpiresAt = new Date(quotedAt.getTime() + DOMAIN_QUOTE_TTL_MS);
  const safetyPolicy = await getPricingSafetyPolicy();

  const hasDomainItems = input.items.some((item) => item.kind !== "PRODUCT");
  const activeTlds = hasDomainItems
    ? await prisma.tld.findMany({ where: { isActive: true } })
    : [];
  const tldByExtension = new Map(activeTlds.map((tld) => [tld.extension.toLowerCase(), tld]));

  let liveWholesale = new Map<string, { tld: string; registerCents: number; renewCents: number; transferCents: number | null; currency: string }>();
  const provider = getDomainProvider();
  if (hasDomainItems) {
    if (!provider.isConfigured()) {
      throw new CheckoutError("Domain checkout is temporarily unavailable because the registrar is not configured.");
    }
    const snapshot = await fetchLiveWholesalePricing(activeTlds);
    liveWholesale = snapshot.byTld;
  }

  for (const raw of input.items) {
    if (raw.kind === "DOMAIN_REGISTRATION") {
      const normalizedDomain = raw.domain.toLowerCase();
      const parts = normalizedDomain.split(".");
      const ext = parts.slice(1).join(".");
      const tld = tldByExtension.get(ext) ?? await prisma.tld.findUnique({ where: { extension: ext } });
      if (!tld || !tld.isActive) {
        throw new CheckoutError(`.${ext} is not currently available for registration.`);
      }

      // GetSawa-managed premium/aftermarket inventory has an explicit listed
      // customer price and therefore does not inherit the ordinary TLD rate.
      const premiumListing = await prisma.premiumDomain.findUnique({ where: { domainName: normalizedDomain } });
      const isListedPremium = Boolean(premiumListing && premiumListing.status === "LISTED");

      if (isListedPremium) {
        const unit = premiumListing!.purchasePriceCents;
        items.push({
          kind: "DOMAIN_REGISTRATION",
          description: `${normalizedDomain} premium domain purchase`,
          domain: normalizedDomain,
          tld: ext,
          years: 1,
          privacy: raw.privacy,
          autoRenew: raw.autoRenew,
          isPremium: true,
          quantity: 1,
          unitPriceCents: unit,
          discountCents: 0,
          totalCents: unit,
          pricingSource: "GETSAWA_PREMIUM_LISTING",
        });
        continue;
      }

      // NameSilo's documented standard price list does not provide the
      // registry's exact cart-time premium quote. TLDs marked premium-capable
      // therefore fail closed unless the active provider explicitly supports
      // authoritative exact premium pricing.
      const exactPremiumPricingSupported = provider.supportsExactPremiumPricing?.() ?? false;
      if (tld.supportsPremium && !exactPremiumPricingSupported) {
        throw new CheckoutError(
          `.${ext} can contain registry-premium domains, but ${provider.name} cannot provide an authoritative exact premium quote before payment. Instant checkout is disabled for this extension until a premium-quote-capable registrar is configured.`,
        );
      }

      const availability = (await provider.checkAvailability([normalizedDomain]))[0];
      if (!availability?.available) {
        throw new CheckoutError(`${normalizedDomain} is no longer available. Please choose another domain.`);
      }

      if (availability.isPremium) {
        if (availability.premiumPriceCents == null) {
          throw new CheckoutError(`The registrar identified ${normalizedDomain} as premium but did not provide a verified price.`);
        }
        if (raw.years !== 1) {
          throw new CheckoutError("Registry-premium domains must be quoted one year at a time.");
        }
        const safe = computeSafeRetailPrice(availability.premiumPriceCents, safetyPolicy);
        items.push({
          kind: "DOMAIN_REGISTRATION",
          description: `${normalizedDomain} premium registration — 1 year`,
          domain: normalizedDomain,
          tld: ext,
          years: 1,
          privacy: raw.privacy,
          autoRenew: raw.autoRenew,
          isPremium: true,
          quantity: 1,
          unitPriceCents: safe.retailCents,
          discountCents: 0,
          totalCents: safe.retailCents,
          minimumTotalCents: safe.retailCents,
          wholesaleCostCents: availability.premiumPriceCents,
          pricingSource: `${provider.name.toUpperCase()}_EXACT_PREMIUM_QUOTE`,
        });
        continue;
      }

      const live = liveWholesale.get(ext);
      if (!live) throw new CheckoutError(`The registrar did not return a current wholesale price for .${ext}.`);
      if (live.currency.toUpperCase() !== currency) {
        throw new CheckoutError(`.${ext} is quoted by the registrar in ${live.currency}; currency conversion is not configured for this checkout.`);
      }

      const configured = computeTldPrice(tld).registerCents * raw.years;
      const wholesaleTotal = live.registerCents * raw.years;
      const unit = enforceRetailFloor(configured, wholesaleTotal, safetyPolicy);
      const safeFloor = computeSafeRetailPrice(wholesaleTotal, safetyPolicy).retailCents;
      items.push({
        kind: "DOMAIN_REGISTRATION",
        description: `${normalizedDomain} registration — ${raw.years} year${raw.years > 1 ? "s" : ""}`,
        domain: normalizedDomain,
        tld: ext,
        years: raw.years,
        privacy: raw.privacy,
        autoRenew: raw.autoRenew,
        isPremium: false,
        quantity: 1,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: unit,
        minimumTotalCents: safeFloor,
        wholesaleCostCents: wholesaleTotal,
        pricingSource: `${provider.name.toUpperCase()}_LIVE_WHOLESALE`,
      });
    } else if (raw.kind === "DOMAIN_RENEWAL") {
      const domain = await prisma.domain.findUnique({ where: { id: raw.domainId }, include: { tld: true } });
      if (!domain || domain.userId !== userId) {
        throw new CheckoutError("Domain not found in your account.");
      }
      if (domain.isPremium && domain.tld.supportsPremium && !(provider.supportsExactPremiumPricing?.() ?? false)) {
        throw new CheckoutError(
          `${domain.name} is a premium domain. Its renewal price must be verified by a registrar that supports exact premium renewal quotes before payment.`,
        );
      }
      const live = liveWholesale.get(domain.tld.extension.toLowerCase());
      if (!live) throw new CheckoutError(`The registrar did not return a current renewal price for .${domain.tld.extension}.`);
      const configured = computeTldPrice(domain.tld).renewCents * raw.years;
      const wholesaleTotal = live.renewCents * raw.years;
      const unit = enforceRetailFloor(configured, wholesaleTotal, safetyPolicy);
      const safeFloor = computeSafeRetailPrice(wholesaleTotal, safetyPolicy).retailCents;
      items.push({
        kind: "DOMAIN_RENEWAL",
        description: `${domain.name} renewal — ${raw.years} year${raw.years > 1 ? "s" : ""}`,
        domain: domain.name,
        domainId: domain.id,
        tld: domain.tld.extension,
        years: raw.years,
        isPremium: domain.isPremium,
        quantity: 1,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: unit,
        minimumTotalCents: safeFloor,
        wholesaleCostCents: wholesaleTotal,
        pricingSource: `${provider.name.toUpperCase()}_LIVE_WHOLESALE`,
      });
    } else if (raw.kind === "DOMAIN_TRANSFER") {
      const normalizedDomain = raw.domain.toLowerCase();
      const parts = normalizedDomain.split(".");
      const ext = parts.slice(1).join(".");
      const tld = tldByExtension.get(ext) ?? await prisma.tld.findUnique({ where: { extension: ext } });
      if (!tld || !tld.isActive) {
        throw new CheckoutError(`.${ext} is not currently available.`);
      }
      if (tld.supportsPremium && !(provider.supportsExactPremiumPricing?.() ?? false)) {
        throw new CheckoutError(
          `.${ext} transfers can carry registry-premium pricing, but the current registrar cannot verify the exact premium transfer price before payment.`,
        );
      }
      const live = liveWholesale.get(ext);
      if (!live || live.transferCents == null) {
        throw new CheckoutError(`Transfers are not currently available for .${ext} domains.`);
      }
      const configuredTransfer = computeTldPrice(tld).transferCents;
      const configured = configuredTransfer ?? 0;
      const unit = enforceRetailFloor(configured, live.transferCents, safetyPolicy);
      const safeFloor = computeSafeRetailPrice(live.transferCents, safetyPolicy).retailCents;
      items.push({
        kind: "DOMAIN_TRANSFER",
        description: `${normalizedDomain} transfer`,
        domain: normalizedDomain,
        tld: ext,
        authCode: raw.authCode,
        quantity: 1,
        unitPriceCents: unit,
        discountCents: 0,
        totalCents: unit,
        minimumTotalCents: safeFloor,
        wholesaleCostCents: live.transferCents,
        pricingSource: `${provider.name.toUpperCase()}_LIVE_WHOLESALE`,
      });
    } else if (raw.kind === "PRODUCT") {
      const product = await prisma.product.findUnique({ where: { sku: raw.sku } });
      if (!product || product.status !== "ACTIVE") {
        throw new CheckoutError("This product is not currently available.");
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
        pricingSource: "PRODUCT_CATALOG",
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
  applyItemMarginFloors(items);

  // ---- Coupon ---------------------------------------------------------------
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

    let remaining = couponDiscount;
    items.forEach((item, i) => {
      if (item.totalCents <= 0) return;
      const share = i === items.length - 1 ? remaining : Math.round((item.totalCents / subtotal) * couponDiscount);
      const applied = Math.min(share, item.totalCents, remaining);
      item.discountCents += applied;
      item.totalCents -= applied;
      remaining -= applied;
    });
    applyItemMarginFloors(items);

    appliedCouponCode = coupon.code;
  }

  const subtotalCents = addCents(...items.map((i) => i.unitPriceCents * i.quantity));
  const totalCents = addCents(...items.map((i) => i.totalCents));
  const discountCents = clampCents(subtotalCents - totalCents);

  return {
    items,
    subtotalCents,
    discountCents,
    totalCents,
    currency,
    appliedPromotionId,
    appliedCouponCode,
    quotedAt: quotedAt.toISOString(),
    quoteExpiresAt: quoteExpiresAt.toISOString(),
  };
}

export class CheckoutError extends Error {}
