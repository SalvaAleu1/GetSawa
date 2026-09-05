import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const bodySchema = z.object({ amountCents: z.number().int().positive().optional(), reason: z.string().trim().max(500).optional() });

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError("Invalid refund request.", 422);
    const payment = await prisma.payment.findUnique({ where: { id }, include: { refunds: true, order: true } });
    if (!payment) return jsonError("Payment not found.", 404);
    if (payment.provider !== "paypal" || !payment.providerCaptureId) return jsonError("This payment cannot be refunded through PayPal.", 409);
    if (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED") return jsonError("Only captured payments can be refunded.", 409);
    const alreadyRefunded = payment.refunds.filter(r => r.status === "COMPLETED").reduce((sum, r) => sum + r.amountCents, 0);
    const remaining = payment.amountCents - alreadyRefunded;
    const amountCents = parsed.data.amountCents ?? remaining;
    if (amountCents > remaining) return jsonError("Refund exceeds the remaining refundable amount.", 422);

    const refundKey = `refund:${payment.id}:${crypto.randomUUID()}`;
    const paypalRefund = await PayPalProvider.refundCapture(payment.providerCaptureId, amountCents, payment.currency, refundKey);
    const providerRefundId = typeof paypalRefund.id === "string" ? paypalRefund.id : null;
    const providerStatus = typeof paypalRefund.status === "string" ? paypalRefund.status.toUpperCase() : "";
    if (!providerRefundId || providerStatus !== "COMPLETED") return jsonError("PayPal did not confirm the refund.", 502);

    const refund = await prisma.$transaction(async tx => {
      const created = await tx.refund.create({ data: { paymentId: payment.id, amountCents, reason: parsed.data.reason || null, providerRefundId, status: "COMPLETED" } });
      const newRefunded = alreadyRefunded + amountCents;
      await tx.payment.update({ where: { id: payment.id }, data: { status: newRefunded >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      if (newRefunded >= payment.amountCents) {
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
        await tx.invoice.updateMany({ where: { orderId: payment.orderId }, data: { status: "REFUNDED" } });
      }
      return created;
    });
    await logAudit({ actorId: admin.id, action: "payments.refund.completed", resource: "payment", resourceId: payment.id, metadata: { refundId: refund.id, providerRefundId, amountCents, reason: parsed.data.reason || null } });
    return jsonOk({ refund });
  } catch (error) { return handleError(error); }
}
