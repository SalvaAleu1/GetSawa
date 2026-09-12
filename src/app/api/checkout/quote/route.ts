import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { checkoutSchema, priceCart, CheckoutError } from "@/lib/checkout";
import { validateDomainLifecycleCheckout } from "@/lib/checkout-domain-guard";
import { validatePricedPremiumCart } from "@/lib/premium-checkout";
import { assertCatalogPriceFloors, validateCatalogCheckout } from "@/lib/catalog-checkout-guard";
import { validateProductCheckoutConfigurations } from "@/lib/product-checkout-config";
import { getAvailableCustomerCredit } from "@/lib/credits";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

const quoteSchema = checkoutSchema.extend({ applyCredit: z.boolean().optional().default(false) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const rl = checkRateLimit("checkout-quote", user.id, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many quote requests. Please wait a moment and try again.", 429);

    const rawBody = await req.json();
    const input = quoteSchema.parse(rawBody);
    await validateDomainLifecycleCheckout(input, user.id);
    await validateProductCheckoutConfigurations(rawBody, input, user.id);
    const catalogFloors = await validateCatalogCheckout(input);
    const priced = await priceCart(input, user.id);
    await validatePricedPremiumCart(priced, user.id);
    assertCatalogPriceFloors(priced, catalogFloors);

    const creditBalanceCents = await getAvailableCustomerCredit(user.id);
    const creditAppliedCents = input.applyCredit ? Math.min(creditBalanceCents, priced.totalCents) : 0;
    const amountDueCents = priced.totalCents - creditAppliedCents;

    return jsonOk({
      items: priced.items.map((item) => ({
        kind: item.kind,
        description: item.description,
        domain: item.domain,
        domainId: item.domainId,
        tld: item.tld,
        years: item.years,
        privacy: item.privacy,
        autoRenew: item.autoRenew,
        productSku: item.productSku,
        isPremium: item.isPremium,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        totalCents: item.totalCents,
        minimumTotalCents: item.minimumTotalCents,
        pricingSource: item.pricingSource,
      })),
      subtotalCents: priced.subtotalCents,
      discountCents: priced.discountCents,
      totalCents: priced.totalCents,
      creditBalanceCents,
      creditAppliedCents,
      amountDueCents,
      currency: priced.currency,
      appliedPromotionId: priced.appliedPromotionId,
      appliedCouponCode: priced.appliedCouponCode,
      quotedAt: priced.quotedAt,
      quoteExpiresAt: priced.quoteExpiresAt,
    });
  } catch (error) {
    if (error instanceof CheckoutError) return jsonError(error.message, 400);
    return handleError(error);
  }
}
