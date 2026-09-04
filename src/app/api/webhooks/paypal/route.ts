import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk } from "@/lib/api";
import { provisionOrder } from "@/lib/provisioning";

/**
 * PayPal webhook receiver. Reference: https://developer.paypal.com/api/rest/webhooks/
 *
 * This endpoint is a safety net, not the primary payment-confirmation path
 * (that's /api/checkout/capture, which runs synchronously in the customer's
 * browser flow). The webhook exists to catch cases the synchronous flow can
 * miss — refunds, disputes, delayed captures, or a customer closing the tab
 * mid-flow — and to make sure every event is processed exactly once.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid payload.", 400);
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !PayPalProvider.isConfigured()) {
    // Fail safe: never process an unverifiable webhook as if it were real.
    return jsonError("Webhook receiver is not configured.", 503);
  }

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  const existing = await prisma.webhookEvent.findUnique({ where: { eventId: event.id } });
  if (existing && existing.processingStatus === "PROCESSED") {
    // Already handled — PayPal retries are expected; do nothing twice.
    return jsonOk({ received: true, duplicate: true });
  }

  const webhookEventRow = await prisma.webhookEvent.upsert({
    where: { eventId: event.id },
    create: {
      provider: "paypal",
      eventId: event.id,
      eventType: event.event_type,
      payloadHash,
      processingStatus: "RECEIVED",
    },
    update: { processingStatus: "RECEIVED", payloadHash },
  });

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
      await prisma.webhookEvent.update({
        where: { id: webhookEventRow.id },
        data: { processingStatus: "FAILED", errorMessage: "Signature verification failed" },
      });
      return jsonError("Webhook signature verification failed.", 400);
    }

    await handleVerifiedEvent(event);

    await prisma.webhookEvent.update({
      where: { id: webhookEventRow.id },
      data: { processingStatus: "PROCESSED", processedAt: new Date() },
    });

    return jsonOk({ received: true });
  } catch (err: any) {
    await prisma.webhookEvent.update({
      where: { id: webhookEventRow.id },
      data: { processingStatus: "FAILED", errorMessage: err.message?.slice(0, 500) },
    });
    // Return 200 so PayPal doesn't hammer retries for an error on our side
    // that a human needs to look at; the FAILED row is what surfaces it to
    // the admin health dashboard.
    return jsonOk({ received: true, error: true });
  }
}

async function handleVerifiedEvent(event: any) {
  const type = event.event_type as string;
  const resource = event.resource;

  switch (type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = resource.id;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment && payment.status !== "PAID") {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID" } });
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAYMENT_CONFIRMED" } });
        await provisionOrder(payment.orderId);
      }
      break;
    }
    case "PAYMENT.CAPTURE.DENIED": {
      const captureId = resource.id;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Denied by PayPal" } });
      }
      break;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const captureId = resource.id;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
      }
      break;
    }
    case "CUSTOMER.DISPUTE.CREATED": {
      const captureId = resource?.disputed_transactions?.[0]?.seller_transaction_id;
      if (captureId) {
        const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
        if (payment) await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED" } });
      }
      break;
    }
    default:
      // Unhandled event types are recorded (status PROCESSED, no side
      // effect) rather than silently dropped, so admins can see the full
      // event history.
      break;
  }
}
