import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["APPROVE","REVERSE"]) });
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN","ADMIN","FINANCE"]);
    const { id } = await params;
    const { action } = schema.parse(await req.json());
    const commission = await prisma.commission.findUnique({ where: { id }, include: { order: { include: { payments: { orderBy: { createdAt: "desc" }, take: 5 } } }, affiliate: { include: { user: { select: { email: true } } } } } });
    if (!commission) return jsonError("Commission not found.", 404);
    if (commission.status === "PAID") return jsonError("A paid commission cannot be changed here. Use finance reconciliation if a provider payout is reversed.", 409);

    if (action === "APPROVE") {
      if (commission.status !== "PENDING") return jsonError("Only pending commissions can be approved.", 409);
      if (!commission.order) return jsonError("This commission is not linked to an order and cannot be approved automatically.", 409);
      if (!["PAYMENT_CONFIRMED","PROVISIONING","ACTIVE"].includes(commission.order.status)) return jsonError(`Order ${commission.order.orderNumber} is not in an eligible paid state.`, 409);
      const hasGoodPayment = commission.order.payments.some((payment) => ["PAID","PARTIALLY_REFUNDED"].includes(payment.status));
      const hasBlockingPayment = commission.order.payments.some((payment) => ["DISPUTED","REFUNDED"].includes(payment.status));
      if (!hasGoodPayment || hasBlockingPayment) return jsonError("Commission cannot be approved while its payment is unpaid, fully refunded, or disputed.", 409);
      await prisma.commission.update({ where: { id }, data: { status: "APPROVED" } });
      await logAudit({ actorId: admin.id, action: "affiliate.commission_approved", resource: "commission", resourceId: id, metadata: { affiliateId: commission.affiliateId, orderId: commission.orderId, amountCents: commission.amountCents } });
      return jsonOk({ status: "APPROVED" });
    }

    if (!["PENDING","APPROVED"].includes(commission.status)) return jsonError("This commission cannot be reversed from its current state.", 409);
    await prisma.commission.update({ where: { id }, data: { status: "REVERSED" } });
    await logAudit({ actorId: admin.id, action: "affiliate.commission_reversed", resource: "commission", resourceId: id, metadata: { affiliateId: commission.affiliateId, orderId: commission.orderId, amountCents: commission.amountCents } });
    return jsonOk({ status: "REVERSED" });
  } catch (error) { return handleError(error); }
}
