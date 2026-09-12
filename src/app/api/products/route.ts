import { NextRequest } from "next/server";
import { ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

const PRODUCT_CATEGORIES = new Set<string>(Object.values(ProductCategory));

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedCategory = searchParams.get("category")?.toUpperCase();

    if (requestedCategory && !PRODUCT_CATEGORIES.has(requestedCategory)) {
      return jsonError("Unknown product category.", 400);
    }

    const category = requestedCategory as ProductCategory | undefined;
    const products = await prisma.product.findMany({
      where: { status: "ACTIVE", category },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        imageUrl: true,
        retailPriceCents: true,
        currency: true,
        billingCycle: true,
        category: true,
      },
    });

    return jsonOk({ products });
  } catch (err) {
    return handleError(err);
  }
}
