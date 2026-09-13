import { NextRequest } from "next/server";
import { ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getProductCommerceMeta, getProductReadiness } from "@/lib/product-readiness";
import { withDeveloperApi } from "@/lib/developer-platform";

const CATEGORIES = new Set<string>(Object.values(ProductCategory));

export async function GET(req: NextRequest) {
  return withDeveloperApi(req, "products:read", "/api/v1/products", async () => {
    const requested = new URL(req.url).searchParams.get("category")?.toUpperCase();
    if (requested && !CATEGORIES.has(requested)) return jsonError("Unknown product category.", 400);
    const products = await prisma.product.findMany({ where: { status: "ACTIVE", category: requested as ProductCategory | undefined }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    const evaluated = await Promise.all(products.map(async (product) => {
      const commerce = await getProductCommerceMeta(product.id);
      const readiness = await getProductReadiness(product, commerce);
      if (!readiness.purchasable) return null;
      return {
        id: product.id, sku: product.sku, name: product.name, description: product.description, imageUrl: product.imageUrl,
        category: product.category, retailPriceCents: product.retailPriceCents, renewalPriceCents: product.renewalPriceCents,
        setupFeeCents: product.setupFeeCents, currency: product.currency, billingCycle: product.billingCycle,
        requiresDomain: commerce?.requiresDomain ?? false, configurationSchema: commerce?.configurationSchema ?? {},
      };
    }));
    return jsonOk({ data: evaluated.filter((value): value is NonNullable<typeof value> => Boolean(value)) });
  });
}
