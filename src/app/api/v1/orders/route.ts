import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/api";
import { withDeveloperApi } from "@/lib/developer-platform";

export async function GET(req: NextRequest) {
  return withDeveloperApi(req, "orders:read", "/api/v1/orders", async ({ client }) => {
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
    const cursor = url.searchParams.get("cursor");
    const orders = await prisma.order.findMany({
      where: { userId: client.userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, orderNumber: true, status: true, subtotalCents: true, discountCents: true, taxCents: true, totalCents: true, currency: true,
        createdAt: true, updatedAt: true,
        items: { select: { id: true, description: true, quantity: true, years: true, unitPriceCents: true, discountCents: true, totalCents: true, provisioningStatus: true } },
        invoice: { select: { invoiceNumber: true, status: true, totalCents: true, currency: true, paidAt: true } },
      },
    });
    const hasMore = orders.length > limit;
    const data = hasMore ? orders.slice(0, limit) : orders;
    return jsonOk({ data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null });
  });
}
