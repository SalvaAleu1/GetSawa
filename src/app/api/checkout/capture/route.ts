import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { provisionOrder } from "@/lib/provisioning";
import { recordCommissionForOrder } from "@/lib/affiliates";
import { generateInvoiceNumber } from "@/lib/pricing";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { sendEmail, emailTemplates } from "@/lib/email";

const schema = z.object({ orderId: z.string().min(1) });

function captureDetails(payload: any) {
  const node = payload?.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = Number(node?.amount?.value);
  return {
    node,
    completed: payload?.status === "COMPLETED" && node?.status === "COMPLETED",
    cents: Number.isFinite(amount) ? Math.round(amount * 100) : -1,
    currency: typeof node?.amount?.currency_code === "string" ? node.amount.currency_code.toUpperCase() : "",
  };
}

async function reconcilePayPalOrder(providerOrderId: string) {
  try {
    return await PayPalProvider.getOrder(providerOrderId);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { orderId } = schema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, user: true } });
    if (!order || order.userId !== user.id) return jsonError("Order not found.", 404);
    if (order.status !== "PENDING_PAYMENT") return jsonOk({ orderId: order.id, status: order.status });

    const payment = order.payments.find((p) => p.status === "PENDING");
    if (!payment?.providerOrderId) return jsonError("No pending payment found for this order.", 400);

    let capture: any = null;
    try {
      capture = await PayPalProvider.captureOrder(payment.providerOrderId, `capture-${order.id}`);
    } catch {
      // A network timeout can happen after PayPal has captured the payment.
      // Reconcile before telling the customer that they were not charged.
      capture = await reconcilePayPalOrder(payment.providerOrderId);
    }

    const details = captureDetails(capture);
    if (!details.completed) {
      const status = typeof capture?.status === "string" ? capture.status : "UNKNOWN";
      if (["VOIDED", "CANCELLED", "DENIED"].includes(status)) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `PayPal status: ${status}` } });
        try { await sendEmail({ to: order.user.email, ...emailTemplates.paymentFailed(order.orderNumber) }); } catch { /* notification is independent */ }
        return jsonError("Payment was not completed. Your order has not been charged.", 402);
      }
      return jsonError("Payment is still being confirmed by PayPal. Please refresh your order shortly.", 202);
    }

    if (details.cents !== order.totalCents || details.currency !== order.currency.toUpperCase()) {
      await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "DISPUTED", failureReason: "Captured amount or currency did not match order total." } });
      return jsonError("Payment verification failed. Please contact support.", 409);
    }

    const captureId = typeof details.node?.id === "string" ? details.node.id : null;
    if (!captureId) return jsonError("PayPal returned a completed capture without a capture ID.", 502);

    const committed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "PAID", providerCaptureId: captureId, failureReason: null },
      });
      if (claimed.count !== 1) return false;

      await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "PAYMENT_CONFIRMED" } });
      const existingInvoice = await tx.invoice.findUnique({ where: { orderId: order.id } });
      if (!existingInvoice) {
        const invoiceCount = await tx.invoice.count();
        await tx.invoice.create({
          data: {
            invoiceNumber: generateInvoiceNumber(invoiceCount + 1),
            orderId: order.id,
            userId: order.userId,
            subtotalCents: order.subtotalCents,
            discountCents: order.discountCents,
            taxCents: order.taxCents,
            totalCents: order.totalCents,
            currency: order.currency,
            status: "PAID",
            paidAt: new Date(),
            billingName: `${order.user.firstName} ${order.user.lastName}`,
            billingEmail: order.user.email,
            billingCountry: order.user.country ?? undefined,
          },
        });
      }
      await tx.ledgerEntry.create({ data: { userId: order.userId, creditCents: order.totalCents, source: "order", reference: order.id, description: `Payment received for order ${order.orderNumber}` } });
      return true;
    });

    if (committed) {
      await logAudit({ actorId: user.id, action: "order.paid", resource: "order", resourceId: order.id });
      await recordCommissionForOrder(order.id, user.id).catch((err) => console.error("[affiliates] commission recording failed:", err));
    }

    await provisionOrder(order.id);
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    return jsonOk({ orderId: order.id, status: finalOrder?.status, orderNumber: order.orderNumber });
  } catch (err) {
    return handleError(err);
  }
}
