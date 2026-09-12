import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { restoreOrderCredit } from "@/lib/credits";
import { recordRefundSettlement } from "@/lib/finance";
import { extractPayPalRefundEconomics } from "@/lib/paypal-economics";

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

    if (payment.provider === "credit") {
      if (payment.status !== "PAID") return jsonError("This account-credit payment is not refundable.", 409);
      const restoredCreditCents = await restoreOrderCredit(payment.orderId);
      if (restoredCreditCents <= 0) return jsonError("No applied account credit remains to restore for this order.", 409);
      await prisma.$transaction([
        prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } }),
        prisma.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } }),
        prisma.invoice.updateMany({ where: { orderId: payment.orderId }, data: { status: "REFUNDED" } }),
      ]);
      await logAudit({ actorId: admin.id, action: "payments.credit_refund.completed", resource: "payment", resourceId: payment.id, metadata: { restoredCreditCents, reason: parsed.data.reason || null } });
      return jsonOk({ creditRefund: true, restoredCreditCents });
    }

    if (payment.provider !== "paypal" || !payment.providerCaptureId) return jsonError("This payment cannot be refunded through the configured provider.", 409);
    if (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED") return jsonError("Only captured payments can be refunded.", 409);
    const alreadyRefunded = payment.refunds.filter((refund) => refund.status === "COMPLETED").reduce((sum, refund) => sum + refund.amountCents, 0);
    const remaining = payment.amountCents - alreadyRefunded;
    const amountCents = parsed.data.amountCents ?? remaining;
    if (amountCents <= 0 || amountCents > remaining) return jsonError("Refund exceeds the remaining refundable amount.", 422);

    const refundKey = `refund:${payment.id}:${crypto.randomUUID()}`;
    const paypalRefund = await PayPalProvider.refundCapture(payment.providerCaptureId, amountCents, payment.currency, refundKey);
    const economics = extractPayPalRefundEconomics(paypalRefund);
    const providerRefundId = economics.refundId;
    const providerStatus = typeof paypalRefund.status === "string" ? paypalRefund.status.toUpperCase() : "";
    if (!providerRefundId || providerStatus !== "COMPLETED") return jsonError("PayPal did not confirm the refund.", 502);
    if (economics.grossCents != null && economics.grossCents !== amountCents) return jsonError("PayPal confirmed a different refund amount. Finance review is required.", 502);
    if (economics.currency && economics.currency !== payment.currency.toUpperCase()) return jsonError("PayPal confirmed the refund in a different currency. Finance review is required.", 502);

    const fullyRefunded = alreadyRefunded + amountCents >= payment.amountCents;
    const refund = await prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({ data: { paymentId: payment.id, amountCents, reason: parsed.data.reason || null, providerRefundId, status: "COMPLETED" } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      if (fullyRefunded) {
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
        await tx.invoice.updateMany({ where: { orderId: payment.orderId }, data: { status: "REFUNDED" } });
      }
      return created;
    });

    const restoredCreditCents = fullyRefunded ? await restoreOrderCredit(payment.orderId) : 0;
    await recordRefundSettlement({ refundId: refund.id, providerFeeCents: economics.providerFeeCents });
    await logAudit({ actorId: admin.id, action: "payments.refund.completed", resource: "payment", resourceId: payment.id, metadata: { refundId: refund.id, providerRefundId, amountCents, restoredCreditCents, reason: parsed.data.reason || null } });
    return jsonOk({ refund, restoredCreditCents });
  } catch (error) { return handleError(error); }
}
