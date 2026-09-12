import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { provisionOrder } from "@/lib/provisioning";
import { recordCommissionForOrder } from "@/lib/affiliates";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { sendEmail, emailTemplates } from "@/lib/email";
import { markRenewalPaid, markRenewalOrderPaymentFailed } from "@/lib/billing";
import { DOMAIN_QUOTE_TTL_MS } from "@/lib/checkout";
import { assertPremiumOrderReservations, releaseOrRestorePremiumOrderReservations } from "@/lib/premium-checkout";
import { assertOrderCreditReservation, finalizeOrderCredit, releaseOrderCredit } from "@/lib/credits";
import { recordPaymentSettlement } from "@/lib/finance";
import { extractPayPalCaptureEconomics } from "@/lib/paypal-economics";

const schema = z.object({ orderId: z.string().min(1) });

function captureDetails(payload: any) {
  const economics = extractPayPalCaptureEconomics(payload && typeof payload === "object" ? payload : {});
  const node = payload?.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    node,
    completed: payload?.status === "COMPLETED" && node?.status === "COMPLETED",
    cents: economics.grossCents ?? -1,
    currency: economics.currency ?? "",
    providerFeeCents: economics.providerFeeCents,
  };
}

async function reconcilePayPalOrder(providerOrderId: string) {
  try { return await PayPalProvider.getOrder(providerOrderId); } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { orderId } = schema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, user: true, items: true } });
    if (!order || order.userId !== user.id) return jsonError("Order not found.", 404);
    if (order.status !== "PENDING_PAYMENT") {
      const paid = order.payments.find((item) => item.status === "PAID");
      if (paid) {
        await finalizeOrderCredit(order.id).catch(() => undefined);
        await recordPaymentSettlement({ paymentId: paid.id, providerReference: paid.providerCaptureId }).catch(() => undefined);
      }
      return jsonOk({ orderId: order.id, status: order.status });
    }

    const payment = order.payments.find((item) => item.status === "PENDING");
    if (!payment?.providerOrderId) return jsonError("No pending payment found for this order.", 400);

    const containsDomainPricing = order.items.some((item) =>
      item.description.includes(" registration") || item.description.includes(" renewal") || item.description.endsWith(" transfer") || item.description.includes("premium domain purchase"),
    );
    if (containsDomainPricing && Date.now() - payment.createdAt.getTime() > DOMAIN_QUOTE_TTL_MS) {
      await prisma.$transaction([
        prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: "Domain price quote expired before payment capture." } }),
        prisma.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", provisioningError: "Pricing quote expired before payment capture." } }),
      ]);
      await releaseOrderCredit(order.id).catch(() => undefined);
      await releaseOrRestorePremiumOrderReservations(order.id, user.id).catch(() => undefined);
      await logAudit({ actorId: user.id, action: "order.quote_expired", resource: "order", resourceId: order.id });
      return jsonError("The domain price quote expired before payment capture. Your payment was not captured; please restart checkout for a fresh price.", 409, { code: "PRICE_QUOTE_EXPIRED" });
    }

    try {
      await assertPremiumOrderReservations(order.id, user.id);
      await assertOrderCreditReservation(order.id, user.id);
    } catch (reservationError) {
      const message = reservationError instanceof Error ? reservationError.message : "A checkout reservation is no longer valid.";
      await prisma.$transaction([
        prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: message.slice(0, 500) } }),
        prisma.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", provisioningError: message.slice(0, 500) } }),
      ]);
      await releaseOrderCredit(order.id).catch(() => undefined);
      await releaseOrRestorePremiumOrderReservations(order.id, user.id).catch(() => undefined);
      return jsonError(message, 409, { code: "CHECKOUT_RESERVATION_EXPIRED" });
    }

    let capture: any = null;
    try { capture = await PayPalProvider.captureOrder(payment.providerOrderId, `capture-${order.id}`); }
    catch { capture = await reconcilePayPalOrder(payment.providerOrderId); }

    const details = captureDetails(capture);
    if (!details.completed) {
      const status = typeof capture?.status === "string" ? capture.status : "UNKNOWN";
      if (["VOIDED", "CANCELLED", "DENIED"].includes(status)) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `PayPal status: ${status}` } });
        await releaseOrderCredit(order.id).catch(() => undefined);
        await releaseOrRestorePremiumOrderReservations(order.id, user.id).catch(() => undefined);
        await markRenewalOrderPaymentFailed(order.id, `PayPal status: ${status}`).catch(() => undefined);
        try { await sendEmail({ to: order.user.email, ...emailTemplates.paymentFailed(order.orderNumber) }); } catch { /* notification is independent */ }
        return jsonError("Payment was not completed. Your order has not been charged.", 402);
      }
      return jsonError("Payment is still being confirmed by PayPal. Please refresh your order shortly.", 202);
    }

    if (details.cents !== payment.amountCents || details.currency !== payment.currency.toUpperCase()) {
      await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "DISPUTED", failureReason: "Captured amount or currency did not match the recorded payment attempt." } });
      return jsonError("Payment verification failed. Please contact support.", 409);
    }

    const captureId = typeof details.node?.id === "string" ? details.node.id : null;
    if (!captureId) return jsonError("PayPal returned a completed capture without a capture ID.", 502);

    const committed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", providerCaptureId: captureId, failureReason: null } });
      if (claimed.count !== 1) return false;
      await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "PAYMENT_CONFIRMED" } });
      return true;
    });

    await finalizeOrderCredit(order.id);
    await recordPaymentSettlement({ paymentId: payment.id, providerReference: captureId, providerFeeCents: details.providerFeeCents });

    if (committed) {
      await logAudit({ actorId: user.id, action: "order.paid", resource: "order", resourceId: order.id });
      await recordCommissionForOrder(order.id, user.id).catch((err) => console.error("[affiliates] commission recording failed:", err));
    }

    await provisionOrder(order.id);
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    if (finalOrder?.status === "ACTIVE") await markRenewalPaid(order.id);
    return jsonOk({ orderId: order.id, status: finalOrder?.status, orderNumber: order.orderNumber });
  } catch (err) { return handleError(err); }
}
