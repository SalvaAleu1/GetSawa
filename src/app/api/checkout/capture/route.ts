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

const schema = z.object({ orderId: z.string() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { orderId } = schema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, user: true },
    });
    if (!order || order.userId !== user.id) return jsonError("Order not found.", 404);

    // Idempotent: if this order has already moved past PENDING_PAYMENT,
    // return its current state instead of capturing PayPal again. This is
    // what stops a double-click on "Pay" from double-charging or
    // double-registering (spec section 147).
    if (order.status !== "PENDING_PAYMENT") {
      return jsonOk({ orderId: order.id, status: order.status });
    }

    const payment = order.payments.find((p) => p.status === "PENDING");
    if (!payment?.providerOrderId) return jsonError("No pending payment found for this order.", 400);

    const capture = await PayPalProvider.captureOrder(payment.providerOrderId, `capture-${order.id}`);
    const captureNode = capture?.purchase_units?.[0]?.payments?.captures?.[0];
    const captureStatus = captureNode?.status;
    const capturedAmount = Number(captureNode?.amount?.value ?? 0) * 100;

    if (capture.status !== "COMPLETED" || captureStatus !== "COMPLETED") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: `PayPal status: ${capture.status}` },
      });
      const template = emailTemplates.paymentFailed(order.orderNumber);
      await sendEmail({ to: order.user.email, ...template });
      return jsonError("Payment was not completed. Your order has not been charged.", 402);
    }

    // Defense in depth: the captured amount must match what we calculated
    // server-side at order creation. Never trust PayPal's echoed amount
    // alone without this check.
    if (Math.round(capturedAmount) !== order.totalCents) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "DISPUTED", failureReason: "Captured amount did not match order total." },
      });
      return jsonError("Payment amount mismatch detected. Please contact support.", 409);
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", providerCaptureId: captureNode.id },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_CONFIRMED" } }),
      prisma.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber((await prisma.invoice.count()) + 1),
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
      }),
      prisma.ledgerEntry.create({
        data: {
          userId: order.userId,
          creditCents: order.totalCents,
          source: "order",
          reference: order.id,
          description: `Payment received for order ${order.orderNumber}`,
        },
      }),
    ]);

    await logAudit({ actorId: user.id, action: "order.paid", resource: "order", resourceId: order.id });

    await recordCommissionForOrder(order.id, user.id).catch((err) => console.error("[affiliates] commission recording failed:", err));

    // Provision synchronously so the customer sees the result immediately.
    // If this were moved to a background job queue, the trigger point would
    // be exactly here.
    await provisionOrder(order.id);

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });

    return jsonOk({ orderId: order.id, status: finalOrder?.status, orderNumber: order.orderNumber });
  } catch (err) {
    return handleError(err);
  }
}
