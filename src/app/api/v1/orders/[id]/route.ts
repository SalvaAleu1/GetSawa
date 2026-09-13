import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { withDeveloperApi } from "@/lib/developer-platform";

type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  const { id } = await params;
  return withDeveloperApi(req, "orders:read", "/api/v1/orders/:id", async ({ client }) => {
    const order = await prisma.order.findFirst({
      where: { id, userId: client.userId },
      select: {
        id: true, orderNumber: true, status: true, subtotalCents: true, discountCents: true, taxCents: true, totalCents: true, currency: true, createdAt: true, updatedAt: true,
        items: { select: { id: true, description: true, quantity: true, years: true, unitPriceCents: true, discountCents: true, totalCents: true, provisioningStatus: true, provisioningNote: true } },
        invoice: { select: { invoiceNumber: true, status: true, subtotalCents: true, discountCents: true, taxCents: true, totalCents: true, currency: true, paidAt: true, createdAt: true } },
        payments: { select: { id: true, provider: true, status: true, amountCents: true, currency: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) return jsonError("Order not found.", 404);
    return jsonOk({ data: order });
  });
}
