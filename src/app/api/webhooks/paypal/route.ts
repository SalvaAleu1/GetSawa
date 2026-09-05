import { NextRequest } from "next/server";
import crypto from "crypto";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk } from "@/lib/api";
import { provisionOrder } from "@/lib/provisioning";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { notifyOrderLifecycle } from "@/lib/order-notifications";
import { prisma } from "@/lib/prisma";
import { markRenewalPaid, markRenewalOrderPaymentFailed } from "@/lib/billing";

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
  const resource = (event.resource && typeof event.resource === "object" ? event.resource : {}) as Record<string, unknown>;
  switch (type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = typeof resource.id === "string" ? resource.id : undefined;
      const supplementary = resource.supplementary_data as Record<string, unknown> | undefined;
      const relatedIds = supplementary?.related_ids as Record<string, unknown> | undefined;
      const paypalOrderId = typeof relatedIds?.order_id === "string" ? relatedIds.order_id : undefined;
      let payment = captureId ? await prisma.payment.findFirst({ where: { providerCaptureId: captureId } }) : null;
      if (!payment && paypalOrderId) payment = await prisma.payment.findFirst({ where: { providerOrderId: paypalOrderId } });
      if (!payment) return;
      if (paypalOrderId && payment.providerOrderId && payment.providerOrderId !== paypalOrderId) throw new Error("PayPal webhook order ID does not match the recorded payment.");

      if (payment.status !== "PAID") {
        const amount = Number((resource.amount as Record<string, unknown> | undefined)?.value);
        const capturedCents = Number.isFinite(amount) ? Math.round(amount * 100) : -1;
        const amountObject = resource.amount as Record<string, unknown> | undefined;
        const capturedCurrency = typeof amountObject?.currency_code === "string" ? String(amountObject.currency_code).toUpperCase() : "";
        if (capturedCents !== payment.amountCents || capturedCurrency !== payment.currency.toUpperCase()) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "Webhook capture amount or currency did not match the recorded payment." } });
          return;
        }
        await prisma.payment.updateMany({ where: { id: payment.id, status: { not: "PAID" } }, data: { status: "PAID", providerCaptureId: captureId || payment.providerCaptureId } });
        await transitionOrderStatus({ orderId: payment.orderId, to: "PAYMENT_CONFIRMED", reason: "PayPal capture verified and payment confirmed.", metadata: { provider: "paypal", captureId } });
      }

      const order = await prisma.order.findUnique({ where: { id: payment.orderId }, include: { user: true } });
      if (order) {
        await notifyOrderLifecycle({
          orderId: order.id, orderNumber: order.orderNumber, userId: order.userId, email: order.user.email,
          type: "ORDER_PAYMENT_CONFIRMED", title: `Payment confirmed for ${order.orderNumber}`,
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
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment && payment.status !== "PAID") {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Denied by PayPal" } });
        await markRenewalOrderPaymentFailed(payment.orderId, "PayPal denied the renewal payment.");
        await transitionOrderStatus({ orderId: payment.orderId, to: "FAILED", reason: "PayPal capture was denied.", metadata: { provider: "paypal", captureId } }).catch(() => undefined);
      }
      break;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const captureId = typeof resource.id === "string" ? resource.id : undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
        await transitionOrderStatus({ orderId: payment.orderId, to: "REFUNDED", reason: "PayPal refund confirmed.", metadata: { provider: "paypal", captureId } });
      }
      break;
    }
    case "CUSTOMER.DISPUTE.CREATED": {
      const disputed = Array.isArray(resource.disputed_transactions) ? resource.disputed_transactions[0] : undefined;
      const captureId = disputed && typeof disputed === "object" && typeof (disputed as Record<string, unknown>).seller_transaction_id === "string" ? (disputed as Record<string, unknown>).seller_transaction_id as string : undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED" } });
      break;
    }
    default: return;
  }
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[c] as string));
}
