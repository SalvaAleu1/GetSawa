import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { generateInvoiceNumber } from "@/lib/pricing";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ orderId: z.string().min(1) });
type RouteContext = { params: Promise<{ id: string }> };

function captureDetails(payload: any) {
  const node = payload?.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = Number(node?.amount?.value);
  return {
    node,
    completed: payload?.status === "COMPLETED" && node?.status === "COMPLETED",
    cents: Number.isFinite(amount) ? Math.round(amount * 100) : -1,
    currency: typeof node?.amount?.currency_code === "string" ? node.amount.currency_code.toUpperCase() : "",
    status: typeof payload?.status === "string" ? payload.status : "UNKNOWN",
  };
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { orderId } = schema.parse(await req.json());
    const auction = await prisma.auction.findUnique({ where: { id }, include: { winningBid: true } });
    if (!auction || auction.winningBid?.userId !== user.id) return jsonError("Auction not found.", 404);

    const auctionRows = await prisma.$queryRaw<Array<{
      status: string;
      winner_user_id: string;
      amount_cents: number;
      currency: string;
      payment_deadline: Date | null;
      order_id: string | null;
      order_item_id: string | null;
    }>>`SELECT "status","winner_user_id","amount_cents","currency","payment_deadline","order_id","order_item_id" FROM "auction_orders" WHERE "auction_id"=${id} LIMIT 1`;
    const auctionOrder = auctionRows[0];
    if (!auctionOrder || auctionOrder.winner_user_id !== user.id || auctionOrder.order_id !== orderId) return jsonError("Auction payment record does not match this order.", 409);
    if (["FULFILLMENT_PENDING", "COMPLETED"].includes(auctionOrder.status)) return jsonOk({ status: auctionOrder.status, orderId });
    if (auctionOrder.status !== "PAYMENT_PENDING") return jsonError("This auction payment is no longer payable.", 409);
    if (!auctionOrder.payment_deadline || auctionOrder.payment_deadline.getTime() <= Date.now()) return jsonError("The winner payment window has expired.", 410);

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, user: true, items: true, invoice: true } });
    if (!order || order.userId !== user.id) return jsonError("Order not found.", 404);
    if (order.totalCents !== auctionOrder.amount_cents || order.currency.toUpperCase() !== auctionOrder.currency.toUpperCase()) return jsonError("Auction order amount does not match the winning bid.", 409);
    const payment = order.payments.find((item) => item.status === "PENDING") ?? order.payments.find((item) => item.status === "PAID");
    if (!payment?.providerOrderId) return jsonError("No auction payment is available for capture.", 400);
    if (payment.status === "PAID") return jsonOk({ status: auctionOrder.status, orderId: order.id, orderNumber: order.orderNumber });

    let capture: any;
    try {
      capture = await PayPalProvider.captureOrder(payment.providerOrderId, `capture-auction-${order.id}`);
    } catch {
      try { capture = await PayPalProvider.getOrder(payment.providerOrderId); }
      catch { return jsonError("Payment confirmation is temporarily unavailable. Your auction order remains reserved.", 502); }
    }

    const details = captureDetails(capture);
    if (!details.completed) {
      if (["VOIDED", "CANCELLED", "DENIED"].includes(details.status)) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `PayPal status: ${details.status}` } });
        return jsonError("Payment was not completed. You can retry while the winner payment window remains open.", 402);
      }
      return jsonError("Payment is still being confirmed. Please check the auction again shortly.", 202);
    }
    if (details.cents !== auctionOrder.amount_cents || details.currency !== auctionOrder.currency.toUpperCase()) {
      await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "DISPUTED", failureReason: "Captured amount or currency did not match the winning auction amount." } });
      await prisma.$executeRaw`UPDATE "auction_orders" SET "status"='FAILED', "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${id} AND "status"='PAYMENT_PENDING'`;
      return jsonError("Payment verification failed. The domain remains held for manual review.", 409);
    }
    const captureId = typeof details.node?.id === "string" ? details.node.id : null;
    if (!captureId) return jsonError("Payment completed without a verifiable capture reference.", 502);
    const orderItem = order.items.find((item) => item.id === auctionOrder.order_item_id) ?? order.items[0];
    if (!orderItem) return jsonError("Auction order item is missing.", 409);

    const invoiceNumber = order.invoice ? null : generateInvoiceNumber((await prisma.invoice.count()) + 1);
    const committed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", providerCaptureId: captureId, failureReason: null } });
      if (claimed.count !== 1) return false;
      await tx.order.update({ where: { id: order.id }, data: { status: "PROVISIONING", provisioningError: null } });
      await tx.orderItem.update({ where: { id: orderItem.id }, data: { provisioningStatus: "MANUAL_REVIEW", provisioningNote: "Payment confirmed. Registrar ownership delivery requires verification before completion." } });
      if (!order.invoice && invoiceNumber) {
        await tx.invoice.create({ data: { invoiceNumber, orderId: order.id, userId: order.userId, subtotalCents: order.subtotalCents, discountCents: order.discountCents, taxCents: order.taxCents, totalCents: order.totalCents, currency: order.currency, status: "PAID", paidAt: new Date(), billingName: `${order.user.firstName} ${order.user.lastName}`, billingEmail: order.user.email, billingCountry: order.user.country ?? undefined } });
      }
      await tx.ledgerEntry.create({ data: { userId: order.userId, creditCents: order.totalCents, source: "auction_order", reference: order.id, description: `Payment received for auction order ${order.orderNumber}` } });
      await tx.$executeRaw`UPDATE "auction_orders" SET "status"='FULFILLMENT_PENDING', "provider_capture_id"=${captureId}, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${id} AND "status"='PAYMENT_PENDING'`;
      await tx.auction.update({ where: { id }, data: { status: "PAID" } });
      return true;
    });

    if (committed) await logAudit({ actorId: user.id, action: "auction.paid", resource: "auction", resourceId: id, metadata: { orderId: order.id, captureId, amountCents: order.totalCents } });
    return jsonOk({ status: "FULFILLMENT_PENDING", orderId: order.id, orderNumber: order.orderNumber });
  } catch (err) {
    return handleError(err);
  }
}
