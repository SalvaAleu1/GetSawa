import { NextRequest } from "next/server";
import crypto from "crypto";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk } from "@/lib/api";
import { provisionOrder } from "@/lib/provisioning";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { notifyOrderLifecycle } from "@/lib/order-notifications";
import { prisma } from "@/lib/prisma";
import { markRenewalPaid } from "@/lib/billing";
import { finalizeOrderCredit, restoreOrderCredit } from "@/lib/credits";
import { handlePaymentAttemptFailure } from "@/lib/payment-recovery";
import { recordPaymentDispute, recordPaymentSettlement, recordRefundSettlement } from "@/lib/finance";
import { extractPayPalCaptureEconomics, extractPayPalRefundEconomics } from "@/lib/paypal-economics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return jsonError("Invalid payload.", 400); }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !PayPalProvider.isConfigured()) return jsonError("Webhook receiver is not configured.", 503);

  const eventId = typeof (event as { id?: unknown })?.id === "string" ? (event as { id: string }).id : "";
  const eventType = typeof (event as { event_type?: unknown })?.event_type === "string" ? (event as { event_type: string }).event_type : "";
  if (!eventId || !eventType) return jsonError("Invalid webhook event.", 400);

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  let row = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (row?.processingStatus === "PROCESSED" || row?.processingStatus === "PROCESSING") return jsonOk({ received: true, duplicate: true });

  if (!row) {
    try {
      row = await prisma.webhookEvent.create({ data: { provider: "paypal", eventId, eventType, payloadHash, processingStatus: "RECEIVED" } });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
      row = await prisma.webhookEvent.findUnique({ where: { eventId } });
      if (!row || row.processingStatus === "PROCESSED" || row.processingStatus === "PROCESSING") return jsonOk({ received: true, duplicate: true });
    }
  } else {
    const reset = await prisma.webhookEvent.updateMany({ where: { id: row.id, processingStatus: "FAILED" }, data: { eventType, payloadHash, processingStatus: "RECEIVED", errorMessage: null } });
    if (reset.count === 0) return jsonOk({ received: true, duplicate: true });
  }
  if (!row) return jsonError("Webhook event could not be recorded.", 500);

  try {
    const verified = await PayPalProvider.verifyWebhookSignature({
      transmissionId: req.headers.get("paypal-transmission-id") || "",
      transmissionTime: req.headers.get("paypal-transmission-time") || "",
      certUrl: req.headers.get("paypal-cert-url") || "",
      authAlgo: req.headers.get("paypal-auth-algo") || "",
      transmissionSig: req.headers.get("paypal-transmission-sig") || "",
      webhookId,
      webhookEvent: event,
    });
    if (!verified) {
      await prisma.webhookEvent.update({ where: { id: row.id }, data: { processingStatus: "FAILED", errorMessage: "Signature verification failed" } });
      return jsonError("Webhook signature verification failed.", 400);
    }
    const claim = await prisma.webhookEvent.updateMany({ where: { id: row.id, processingStatus: "RECEIVED" }, data: { processingStatus: "PROCESSING" } });
    if (claim.count !== 1) return jsonOk({ received: true, duplicate: true });
    await handleVerifiedEvent(event as Record<string, unknown>);
    await prisma.webhookEvent.update({ where: { id: row.id }, data: { processingStatus: "PROCESSED", processedAt: new Date(), errorMessage: null } });
    return jsonOk({ received: true });
  } catch (err: unknown) {
    await prisma.webhookEvent.update({ where: { id: row.id }, data: { processingStatus: "FAILED", errorMessage: String(err instanceof Error ? err.message : "Webhook processing failed").slice(0, 500) } });
    return jsonError("Webhook processing failed.", 500);
  }
}

async function handleVerifiedEvent(event: Record<string, unknown>) {
  const type = typeof event.event_type === "string" ? event.event_type : "";
  const resource = (event.resource && typeof event.resource === "object" ? event.resource : {}) as Record<string, any>;

  switch (type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const economics = extractPayPalCaptureEconomics(resource);
      const captureId = economics.captureId;
      const paypalOrderId = relatedId(resource, "order_id");
      let payment = captureId ? await prisma.payment.findFirst({ where: { providerCaptureId: captureId } }) : null;
      if (!payment && paypalOrderId) payment = await prisma.payment.findFirst({ where: { providerOrderId: paypalOrderId } });
      if (!payment) return;
      if (paypalOrderId && payment.providerOrderId && payment.providerOrderId !== paypalOrderId) throw new Error("PayPal webhook order ID does not match the recorded payment.");
      if (!captureId || economics.grossCents !== payment.amountCents || economics.currency !== payment.currency.toUpperCase()) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "Webhook capture amount, currency or capture reference did not match the recorded payment." } });
        await recordPaymentDispute({ paymentId: payment.id, providerReference: captureId || paypalOrderId || String(event.id || "unknown") }).catch(() => undefined);
        return;
      }

      const claimed = await prisma.payment.updateMany({ where: { id: payment.id, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { status: "PAID", providerCaptureId: captureId, failureReason: null } });
      if (claimed.count === 1) {
        await transitionOrderStatus({ orderId: payment.orderId, to: "PAYMENT_CONFIRMED", reason: "PayPal capture verified and payment confirmed.", metadata: { provider: "paypal", captureId } });
      }
      await finalizeOrderCredit(payment.orderId);
      await recordPaymentSettlement({ paymentId: payment.id, providerReference: captureId, providerFeeCents: economics.providerFeeCents });

      const order = await prisma.order.findUnique({ where: { id: payment.orderId }, include: { user: true } });
      if (order && claimed.count === 1) {
        await notifyOrderLifecycle({
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          email: order.user.email,
          type: "ORDER_PAYMENT_CONFIRMED",
          title: `Payment confirmed for ${order.orderNumber}`,
          body: `Your payment for order ${order.orderNumber} has been confirmed. Fulfilment is starting now.`,
          emailSubject: `Payment confirmed — ${order.orderNumber}`,
          emailHtml: `<p>Your payment for order <strong>${escapeHtml(order.orderNumber)}</strong> has been confirmed. Fulfilment is starting now.</p>`,
        });
      }
      await provisionOrder(payment.orderId);
      const completed = await prisma.order.findUnique({ where: { id: payment.orderId }, select: { status: true } });
      if (completed?.status === "ACTIVE") await markRenewalPaid(payment.orderId);
      break;
    }

    case "PAYMENT.CAPTURE.DENIED": {
      const captureId = typeof resource.id === "string" ? resource.id : undefined;
      const paypalOrderId = relatedId(resource, "order_id");
      let payment = captureId ? await prisma.payment.findFirst({ where: { providerCaptureId: captureId } }) : null;
      if (!payment && paypalOrderId) payment = await prisma.payment.findFirst({ where: { providerOrderId: paypalOrderId } });
      if (payment && payment.status !== "PAID") {
        await handlePaymentAttemptFailure({ paymentId: payment.id, orderId: payment.orderId, message: "Denied by PayPal", providerStatus: "DENIED" });
      }
      break;
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      const economics = extractPayPalRefundEconomics(resource);
      const refundId = economics.refundId;
      const captureId = relatedId(resource, "capture_id") || captureIdFromLinks(resource);
      if (!refundId || !captureId || economics.grossCents == null || economics.grossCents <= 0) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId }, include: { refunds: true } });
      if (!payment) return;
      if (economics.currency && economics.currency !== payment.currency.toUpperCase()) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "PayPal refund currency did not match the captured payment." } });
        return;
      }

      let refund = await prisma.refund.findFirst({ where: { providerRefundId: refundId } });
      if (!refund) {
        const alreadyRefunded = payment.refunds.filter((row) => row.status === "COMPLETED").reduce((sum, row) => sum + row.amountCents, 0);
        if (alreadyRefunded + economics.grossCents > payment.amountCents) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "PayPal reported refunds exceeding the captured payment." } });
          return;
        }
        refund = await prisma.refund.create({ data: { paymentId: payment.id, amountCents: economics.grossCents, reason: "Refund confirmed by PayPal webhook", providerRefundId: refundId, status: "COMPLETED" } });
      }

      const totals = await prisma.refund.aggregate({ where: { paymentId: payment.id, status: "COMPLETED" }, _sum: { amountCents: true } });
      const refundedCents = totals._sum.amountCents ?? 0;
      const fullyRefunded = refundedCents >= payment.amountCents;
      await prisma.payment.update({ where: { id: payment.id }, data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      if (fullyRefunded) {
        await transitionOrderStatus({ orderId: payment.orderId, to: "REFUNDED", reason: "PayPal refund confirmed.", metadata: { provider: "paypal", refundId } }).catch(() => undefined);
        await prisma.invoice.updateMany({ where: { orderId: payment.orderId }, data: { status: "REFUNDED" } });
        await restoreOrderCredit(payment.orderId);
      }
      await recordRefundSettlement({ refundId: refund.id, providerFeeCents: economics.providerFeeCents });
      break;
    }

    case "CUSTOMER.DISPUTE.CREATED": {
      const disputed = Array.isArray(resource.disputed_transactions) ? resource.disputed_transactions[0] : undefined;
      const captureId = disputed && typeof disputed === "object" && typeof (disputed as Record<string, unknown>).seller_transaction_id === "string" ? (disputed as Record<string, unknown>).seller_transaction_id as string : undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED" } });
        await recordPaymentDispute({ paymentId: payment.id, providerReference: captureId });
      }
      break;
    }

    default:
      return;
  }
}

function relatedId(resource: Record<string, any>, key: string): string | null {
  const supplementary = resource.supplementary_data && typeof resource.supplementary_data === "object" ? resource.supplementary_data : {};
  const related = supplementary.related_ids && typeof supplementary.related_ids === "object" ? supplementary.related_ids : {};
  return typeof related[key] === "string" ? related[key] : null;
}

function captureIdFromLinks(resource: Record<string, any>): string | null {
  const links = Array.isArray(resource.links) ? resource.links : [];
  const up = links.find((link) => link && typeof link === "object" && (link.rel === "up" || link.rel === "capture"));
  const href = typeof up?.href === "string" ? up.href : "";
  const match = href.match(/\/captures\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[character] as string));
}
