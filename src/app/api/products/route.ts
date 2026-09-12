import { NextRequest } from "next/server";
import { ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getProductCommerceMeta, getProductReadiness } from "@/lib/product-readiness";

const PRODUCT_CATEGORIES = new Set<string>(Object.values(ProductCategory));

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedCategory = searchParams.get("category")?.toUpperCase();
    if (requestedCategory && !PRODUCT_CATEGORIES.has(requestedCategory)) {
      return jsonError("Unknown product category.", 400);
    }

    const category = requestedCategory as ProductCategory | undefined;
    const candidates = await prisma.product.findMany({
      where: { status: "ACTIVE", category },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const evaluated = await Promise.all(candidates.map(async (product) => {
      const commerce = await getProductCommerceMeta(product.id);
      const readiness = await getProductReadiness(product, commerce);
      if (!readiness.purchasable) return null;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        retailPriceCents: product.retailPriceCents,
        renewalPriceCents: product.renewalPriceCents,
        setupFeeCents: product.setupFeeCents,
        currency: product.currency,
        billingCycle: product.billingCycle,
        category: product.category,
        requiresDomain: commerce?.requiresDomain ?? false,
        configurationSchema: commerce?.configurationSchema ?? {},
      };
    }));

    return jsonOk({ products: evaluated.filter((product): product is NonNullable<typeof product> => Boolean(product)) });
  } catch (err) {
    return handleError(err);
  }
}
