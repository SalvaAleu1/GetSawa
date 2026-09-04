import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const products = await prisma.product.findMany({
      where: { status: "ACTIVE", category: category ? (category as any) : undefined },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, sku: true, name: true, description: true, imageUrl: true,
        retailPriceCents: true, currency: true, billingCycle: true, category: true,
      },
    });

    return jsonOk({ products });
  } catch (err) {
    return handleError(err);
  }
}
