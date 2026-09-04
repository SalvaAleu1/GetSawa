import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk } from "@/lib/api";
import { provisionOrder } from "@/lib/provisioning";

/**
 * PayPal webhook receiver.
 *
 * Security properties:
 * - raw request body is hashed before parsing
 * - PayPal transmission headers are verified server-side
 * - event IDs are persisted for idempotency
 * - payment/order mutations are derived from our database, not client data
 * - processing failures return 5xx so PayPal can retry
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
    return jsonError("Webhook receiver is not configured.", 503);
  }

  const eventId = typeof event?.id === "string" ? event.id : "";
  const eventType = typeof event?.event_type === "string" ? event.event_type : "";
  if (!eventId || !eventType) return jsonError("Invalid webhook event.", 400);

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (existing?.processingStatus === "PROCESSED") {
    return jsonOk({ received: true, duplicate: true });
  }

  const row = await prisma.webhookEvent.upsert({
    where: { eventId },
    create: {
      provider: "paypal",
      eventId,
      eventType,
      payloadHash,
      processingStatus: "RECEIVED",
    },
    update: {
      eventType,
      payloadHash,
      processingStatus: "RECEIVED",
      errorMessage: null,
    },
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
        where: { id: row.id },
        data: { processingStatus: "FAILED", errorMessage: "Signature verification failed" },
      });
      return jsonError("Webhook signature verification failed.", 400);
    }

    await handleVerifiedEvent(event);

    await prisma.webhookEvent.update({
      where: { id: row.id },
      data: { processingStatus: "PROCESSED", processedAt: new Date(), errorMessage: null },
    });

    return jsonOk({ received: true });
  } catch (err: any) {
    await prisma.webhookEvent.update({
      where: { id: row.id },
      data: {
        processingStatus: "FAILED",
        errorMessage: String(err?.message || "Webhook processing failed").slice(0, 500),
      },
    });
    // A 5xx response is intentional. PayPal can retry transient failures;
    // the persisted event ID prevents duplicate side effects after recovery.
    return jsonError("Webhook processing failed.", 500);
  }
}

async function handleVerifiedEvent(event: any) {
  const type = event.event_type as string;
  const resource = event.resource || {};

  switch (type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = resource.id as string | undefined;
      const orderId = resource?.supplementary_data?.related_ids?.order_id as string | undefined;

      let payment = captureId
        ? await prisma.payment.findFirst({ where: { providerCaptureId: captureId } })
        : null;

      if (!payment && orderId) {
        payment = await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
      }

      if (!payment) return;

      if (payment.status !== "PAID") {
        const amount = Number(resource?.amount?.value ?? 0);
        const capturedCents = Math.round(amount * 100);
        if (capturedCents !== payment.amountCents) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "DISPUTED", failureReason: "Webhook capture amount did not match recorded payment." },
          });
          return;
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "PAID", providerCaptureId: captureId || payment.providerCaptureId },
        });
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAYMENT_CONFIRMED" } });
      }

      await provisionOrder(payment.orderId);
      break;
    }

    case "PAYMENT.CAPTURE.DENIED": {
      const captureId = resource.id as string | undefined;
      if (!captureId) return;
      const payment = await prisma.payment.findFirst({ where: { providerCaptureId: captureId } });
      if (payment && payment.status !== "PAID") {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Denied by PayPal" } });
      }
      break;
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      const captureId = resource.id as string | undefined;
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

    default:
      // The event is still recorded as processed. Unknown events have no
      // financial side effect until explicitly supported.
      break;
  }
}
