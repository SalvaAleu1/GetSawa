import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { completePremiumFulfillment } from "@/lib/premium-aftermarket";
import { provisionOrder } from "@/lib/provisioning";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  registrarVerified: z.literal(true),
  registrarReference: z.string().trim().min(3).max(250),
});
type RouteContext = { params: Promise<{ orderItemId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
    const { orderItemId } = await params;
    const input = schema.parse(await req.json());
    const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true, provisioningStatus: true } });
    if (!item) return jsonError("Premium fulfillment item not found.", 404);
    if (item.provisioningStatus !== "MANUAL_REVIEW") return jsonError("This premium item is not awaiting ownership verification.", 409);

    const result = await completePremiumFulfillment({ orderItemId, adminUserId: admin.id, registrarReference: input.registrarReference });
    await logAudit({
      actorId: admin.id,
      action: "premium_sale.fulfilled",
      resource: "order_item",
      resourceId: orderItemId,
      metadata: { listingId: result.listingId, domainId: result.domainId, saleId: result.saleId, registrarReference: input.registrarReference },
    });
    await provisionOrder(item.orderId);
    const order = await prisma.order.findUnique({ where: { id: item.orderId }, select: { status: true, orderNumber: true } });
    return jsonOk({ result, order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not complete premium-domain fulfillment.";
    if (message.includes("premium") || message.includes("domain") || message.includes("inventory") || message.includes("fulfillment") || message.includes("registrar")) return jsonError(message, 400);
    return handleError(err);
  }
}
