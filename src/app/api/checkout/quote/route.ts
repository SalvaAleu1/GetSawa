import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkoutSchema, priceCart, CheckoutError } from "@/lib/checkout";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const rl = checkRateLimit("checkout-quote", user.id, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many quote requests. Please wait a moment and try again.", 429);

    const input = checkoutSchema.parse(await req.json());
    const priced = await priceCart(input, user.id);

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
