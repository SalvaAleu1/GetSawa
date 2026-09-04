import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk } from "@/lib/api";
import { provisionOrder } from "@/lib/provisioning";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let event: any;
  try { event = JSON.parse(rawBody); } catch { return jsonError("Invalid payload.", 400); }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !PayPalProvider.isConfigured()) return jsonError("Webhook receiver is not configured.", 503);

  const eventId = typeof event?.id === "string" ? event.id : "";
  const eventType = typeof event?.event_type === "string" ? event.event_type : "";
  if (!eventId || !eventType) return jsonError("Invalid webhook event.", 400);

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  let row = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (row?.processingStatus === "PROCESSED" || row?.processingStatus === "PROCESSING") {
    return jsonOk({ received: true, duplicate: true });
  }

  if (!row) {
    try {
      row = await prisma.webhookEvent.create({
        data: { provider: "paypal", eventId, eventType, payloadHash, processingStatus: "RECEIVED" },
      });
    } catch (error: any) {
      // Another request may have created the unique event between our read
      // and create. Never overwrite its processing state.
      if (error?.code !== "P2002") throw error;
      row = await prisma.webhookEvent.findUnique({ where: { eventId } });
      if (!row || row.processingStatus === "PROCESSED" || row.processingStatus === "PROCESSING") {
        return jsonOk({ received: true, duplicate: true });
      }
    }
  } else {
    // A previously failed delivery may be retried. Keep the same event row,
    // but refresh the payload metadata without touching an active claim.
    row = await prisma.webhookEvent.update({
      where: { id: row.id },
      data: { eventType, payloadHash, processingStatus: "RECEIVED", errorMessage: null },
    });
  }

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

    const claim = await prisma.webhookEvent.updateMany({
      where: { id: row.id, processingStatus: "RECEIVED" },
      data: { processingStatus: "PROCESSING" },
    });
    if (claim.count !== 1) return jsonOk({ received: true, duplicate: true });

    await handleVerifiedEvent(event);
    await prisma.webhookEvent.update({ where: { id: row.id }, data: { processingStatus: "PROCESSED", processedAt: new Date(), errorMessage: null } });
    return jsonOk({ received: true });
  } catch (err: any) {
    await prisma.webhookEvent.update({
      where: { id: row.id },
      data: { processingStatus: "FAILED", errorMessage: String(err?.message || "Webhook processing failed").slice(0, 500) },
    });
    return jsonError("Webhook processing failed.", 500);
  }
}

async function handleVerifiedEvent(event: any) {
  const type = event.event_type as string;
  const resource = event.resource || {};

  switch (type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = typeof resource.id === "string" ? resource.id : undefined;
      const paypalOrderId = typeof resource?.supplementary_data?.related_ids?.order_id === "string" ? resource.supplementary_data.related_ids.order_id : undefined;
      let payment = captureId ? await prisma.payment.findFirst({ where: { providerCaptureId: captureId } }) : null;
      if (!payment && paypalOrderId) payment = await prisma.payment.findFirst({ where: { providerOrderId: paypalOrderId } });
      if (!payment) return;
      if (paypalOrderId && payment.providerOrderId && payment.providerOrderId !== paypalOrderId) throw new Error("PayPal webhook order ID does not match the recorded payment.");

      if (payment.status !== "PAID") {
        const amount = Number(resource?.amount?.value);
        const capturedCents = Number.isFinite(amount) ? Math.round(amount * 100) : -1;
        const capturedCurrency = typeof resource?.amount?.currency_code === "string" ? resource.amount.currency_code.toUpperCase() : "";
        if (capturedCents !== payment.amountCents || capturedCurrency !== payment.currency.toUpperCase()) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "Webhook capture amount or currency did not match the recorded payment." } });
          return;
        }
        await prisma.payment.updateMany({ where: { id: payment.id, status: { not: "PAID" } }, data: { status: "PAID", providerCaptureId: captureId || payment.providerCaptureId } });
        await prisma.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" }, data: { status: "PAYMENT_CONFIRMED" } });
      }
      await provisionOrder(payment.orderId);
      break;
    }
    case "PAYMENT.CAPTURE.DENIED": {
      const captureId = typeof resource.id === "string" ? resource.id : undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment && payment.status !== "PAID") await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Denied by PayPal" } });
      break;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const captureId = typeof resource.id === "string" ? resource.id : undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
      }
      break;
    }
    case "CUSTOMER.DISPUTE.CREATED": {
      const captureId = resource?.disputed_transactions?.[0]?.seller_transaction_id as string | undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED" } });
      break;
    }
    default: return;
  }
}
