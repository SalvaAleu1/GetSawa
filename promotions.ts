import { Promotion } from "@prisma/client";
import { clampCents } from "@/lib/money";

/**
 * Promotions are stored as data (Promotion.rules JSON), not code, so admins
 * can create/edit them from the dashboard without a developer. This module
 * is the only place that interprets that JSON and turns it into a discount.
 * All evaluation happens server-side at checkout — never trust a discount
 * computed in the browser.
 */

export interface CartItemContext {
  id: string; // order item reference (temp id during checkout)
  kind: "DOMAIN_REGISTRATION" | "DOMAIN_RENEWAL" | "DOMAIN_TRANSFER" | "PRODUCT";
  tld?: string;
  productSku?: string;
  isPremium?: boolean;
  years?: number;
  billingCycle?: string;
  unitPriceCents: number;
  quantity: number;
}

export interface PromotionContext {
  isNewCustomer: boolean;
  cart: CartItemContext[];
}

export interface PromotionCondition {
  field: "customer.isNew" | "cart.hasSku" | "cart.hasTld" | "cart.hasKind" | "cart.minSubtotalCents";
  op: "eq" | "in" | "gte" | "lte";
  value: unknown;
}

export interface PromotionEffect {
  type: "FREE_ITEM" | "PERCENT_OFF_ITEM" | "FIXED_OFF_ITEM";
  targetKind?: CartItemContext["kind"];
  targetTlds?: string[]; // if omitted, applies to all eligible TLDs
  targetSkus?: string[];
  excludePremium?: boolean;
  maxQuantity?: number; // cap how many cart items receive the discount
  percent?: number; // for PERCENT_OFF_ITEM
  amountCents?: number; // for FIXED_OFF_ITEM
}

export interface PromotionRules {
  conditionLogic: "AND" | "OR";
  conditions: PromotionCondition[];
  effects: PromotionEffect[];
}

function evaluateCondition(cond: PromotionCondition, ctx: PromotionContext): boolean {
  switch (cond.field) {
    case "customer.isNew":
      return ctx.isNewCustomer === Boolean(cond.value);
    case "cart.hasSku":
      return ctx.cart.some((i) => i.productSku && (cond.value as string[]).includes(i.productSku));
    case "cart.hasTld":
      return ctx.cart.some((i) => i.tld && (cond.value as string[]).includes(i.tld));
    case "cart.hasKind":
      return ctx.cart.some((i) => (cond.value as string[]).includes(i.kind));
    case "cart.minSubtotalCents": {
      const subtotal = ctx.cart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
      return subtotal >= Number(cond.value);
    }
    default:
      return false;
  }
}

export function isPromotionEligible(promotion: Promotion, ctx: PromotionContext): boolean {
  if (!promotion.isActive) return false;
  const now = new Date();
  if (promotion.startsAt && now < promotion.startsAt) return false;
  if (promotion.endsAt && now > promotion.endsAt) return false;

  const rules = promotion.rules as unknown as PromotionRules;
  if (!rules?.conditions?.length) return true;

  const results = rules.conditions.map((c) => evaluateCondition(c, ctx));
  return rules.conditionLogic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

export interface DiscountResult {
  itemId: string;
  discountCents: number;
}

/**
 * Computes per-item discounts for an eligible promotion. Premium domains are
 * excluded by default unless the effect explicitly opts them in — this
 * enforces the business rule from spec section 7 (premium domains never get
 * an automatic promo unless explicitly enabled).
 */
export function applyPromotionDiscounts(promotion: Promotion, ctx: PromotionContext): DiscountResult[] {
  const rules = promotion.rules as unknown as PromotionRules;
  const discounts: DiscountResult[] = [];

  for (const effect of rules.effects ?? []) {
    let matched = ctx.cart.filter((item) => {
      if (effect.targetKind && item.kind !== effect.targetKind) return false;
      if (effect.targetTlds?.length && (!item.tld || !effect.targetTlds.includes(item.tld))) return false;
      if (effect.targetSkus?.length && (!item.productSku || !effect.targetSkus.includes(item.productSku))) return false;
      if (item.isPremium && effect.excludePremium !== false) return false;
      return true;
    });

    if (effect.maxQuantity) {
      matched = matched.slice(0, effect.maxQuantity);
    }

    for (const item of matched) {
      let discountCents = 0;
      if (effect.type === "FREE_ITEM") {
        discountCents = item.unitPriceCents;
      } else if (effect.type === "PERCENT_OFF_ITEM") {
        discountCents = Math.round((item.unitPriceCents * (effect.percent ?? 0)) / 100);
      } else if (effect.type === "FIXED_OFF_ITEM") {
        discountCents = effect.amountCents ?? 0;
      }
      discountCents = clampCents(Math.min(discountCents, item.unitPriceCents));
      if (discountCents > 0) discounts.push({ itemId: item.id, discountCents });
    }
  }

  if (promotion.maxDiscountCents) {
    const total = discounts.reduce((s, d) => s + d.discountCents, 0);
    if (total > promotion.maxDiscountCents) {
      const ratio = promotion.maxDiscountCents / total;
      return discounts.map((d) => ({ itemId: d.itemId, discountCents: Math.floor(d.discountCents * ratio) }));
    }
  }

  return discounts;
}

/**
 * Given all active promotions and the current cart, selects which
 * promotion(s) apply according to priority/stacking/exclusivity rules
 * (spec section 126 — offer priority engine).
 */
export function selectApplicablePromotions(promotions: Promotion[], ctx: PromotionContext): Promotion[] {
  const eligible = promotions.filter((p) => isPromotionEligible(p, ctx));
  if (eligible.length === 0) return [];

  const sorted = [...eligible].sort((a, b) => b.priority - a.priority);
  const top = sorted[0];
  if (!top) return [];
  if (top.isExclusive || !top.isStackable) return [top];

  return sorted.filter((p) => p.isStackable);
}
