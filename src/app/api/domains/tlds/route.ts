import { prisma } from "@/lib/prisma";
import { computeProtectedTldPrice } from "@/lib/pricing";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const [tlds, policy] = await Promise.all([
      prisma.tld.findMany({ where: { isActive: true }, orderBy: [{ isFeatured: "desc" }, { extension: "asc" }] }),
      getPricingSafetyPolicy(),
    ]);

    return jsonOk({
      tlds: tlds.map((tld) => {
        const price = computeProtectedTldPrice(tld, policy);
        return {
          extension: tld.extension,
          isFeatured: tld.isFeatured,
          supportsPrivacy: tld.supportsPrivacy,
          supportsPremium: tld.supportsPremium,
          minYears: tld.minYears,
          maxYears: tld.maxYears,
          promotionEligible: tld.promotionEligible,
          registerPriceCents: price.registerCents,
          renewPriceCents: price.renewCents,
          transferPriceCents: price.transferCents,
          currency: price.currency,
          pricingProtected: price.wholesaleAvailable,
          wholesaleUpdatedAt: tld.wholesaleUpdatedAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
