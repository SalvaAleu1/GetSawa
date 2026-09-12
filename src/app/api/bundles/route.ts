import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getBundleReadiness } from "@/lib/bundle-readiness";

export async function GET() {
  try {
    const candidates = await prisma.bundle.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
    const evaluated = await Promise.all(candidates.map(async (bundle) => ({ bundle, readiness: await getBundleReadiness(bundle) })));
    const bundles = evaluated
      .filter(({ readiness }) => readiness.purchasable)
      .map(({ bundle, readiness }) => ({
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        productSkus: bundle.productSkus,
        bundlePriceCents: bundle.bundlePriceCents,
        renewalPriceCents: bundle.renewalPriceCents,
        products: readiness.products,
      }));
    return jsonOk({ bundles, currency: "USD" });
  } catch (error) {
    return handleError(error);
  }
}
