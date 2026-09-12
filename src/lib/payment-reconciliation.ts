import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { provisionOrder } from "@/lib/provisioning";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { notifyOrderLifecycle } from "@/lib/order-notifications";
import { markRenewalPaid, markRenewalOrderPaymentFailed } from "@/lib/billing";
import { generateInvoiceNumber } from "@/lib/pricing";
import { logAudit } from "@/lib/audit";

export interface ReconciliationResult {
  inspected: number;
  confirmed: number;
  failed: number;
  unchanged: number;
  skipped: number;
}

export async function reconcilePendingPayPalPayments(limit = 50): Promise<ReconciliationResult> {
  if (!PayPalProvider.isConfigured()) throw new Error("PayPal is not configured.");

  const payments = await prisma.payment.findMany({
    where: {
      provider: "paypal",
      status: { in: ["PENDING", "AUTHORIZED"] },
      providerOrderId: { not: null },
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { order: { include: { user: true, items: true, invoice: true } } },
  });

  const result: ReconciliationResult = { inspected: payments.length, confirmed: 0, failed: 0, unchanged: 0, skipped: 0 };

  for (const payment of payments) {
    if (!payment.providerOrderId) {
      result.skipped++;
      continue;
    }

    try {
      const paypalOrder = await PayPalProvider.getOrder(payment.providerOrderId);
      const status = typeof paypalOrder.status === "string" ? paypalOrder.status.toUpperCase() : "";

      if (status === "COMPLETED") {
        const details = completedPaymentDetails(paypalOrder);
        if (details.cents !== payment.amountCents || details.currency !== payment.currency.toUpperCase()) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "PayPal reconciliation amount or currency mismatch." } });
          const auction = await findAuctionOrder(payment.orderId);
          if (auction) {
            await prisma.$executeRaw`UPDATE "auction_orders" SET "status"='FAILED', "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${auction.auction_id} AND "status"='PAYMENT_PENDING'`;
          }
          result.skipped++;
          continue;
        }

        const auction = await findAuctionOrder(payment.orderId);
        if (auction) {
          const reconciled = await reconcileCompletedAuctionPayment({
            paymentId: payment.id,
            orderId: payment.orderId,
            captureId: details.captureId,
            auctionId: auction.auction_id,
          });
          if (!reconciled) {
            result.unchanged++;
            continue;
          }
          await notifyOrderLifecycle({
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            userId: payment.order.userId,
            email: payment.order.user.email,
            type: "ORDER_PAYMENT_CONFIRMED",
            title: `Payment confirmed for ${payment.order.orderNumber}`,
            body: `Your auction payment for order ${payment.order.orderNumber} has been confirmed. Ownership delivery is now being processed.`,
            emailSubject: `Auction payment confirmed — ${payment.order.orderNumber}`,
            emailHtml: `<p>Your auction payment for order <strong>${escapeHtml(payment.order.orderNumber)}</strong> has been confirmed.</p><p>Registrar ownership delivery is now being processed.</p>`,
          });
          await logAudit({ actorId: null, action: "auction.payment_reconciled", resource: "auction", resourceId: auction.auction_id, metadata: { orderId: payment.orderId, paypalOrderId: payment.providerOrderId, captureId: details.captureId } }).catch(() => undefined);
          result.confirmed++;
          continue;
        }

        await prisma.payment.updateMany({ where: { id: payment.id, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { status: "PAID", providerCaptureId: details.captureId || payment.providerCaptureId } });
        await transitionOrderStatus({ orderId: payment.orderId, to: "PAYMENT_CONFIRMED", reason: "Payment reconciled from PayPal order state.", metadata: { provider: "paypal", paypalOrderId: payment.providerOrderId } });
        await notifyOrderLifecycle({
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          userId: payment.order.userId,
          email: payment.order.user.email,
          type: "ORDER_PAYMENT_CONFIRMED",
          title: `Payment confirmed for ${payment.order.orderNumber}`,
          body: `Your payment for order ${payment.order.orderNumber} has been confirmed. Fulfilment is starting now.`,
          emailSubject: `Payment confirmed — ${payment.order.orderNumber}`,
          emailHtml: `<p>Your payment for order <strong>${escapeHtml(payment.order.orderNumber)}</strong> has been confirmed. Fulfilment is starting now.</p>`,
        });
        await provisionOrder(payment.orderId);
        const completed = await prisma.order.findUnique({ where: { id: payment.orderId }, select: { status: true } });
        if (completed?.status === "ACTIVE") await markRenewalPaid(payment.orderId);
        result.confirmed++;
        continue;
      }

      if (["VOIDED", "CANCELLED", "DENIED"].includes(status)) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { status: "FAILED", failureReason: `PayPal order is ${status.toLowerCase()}.` } });
        const auction = await findAuctionOrder(payment.orderId);
        if (auction) {
          // The winner keeps the inventory reservation until the auction payment
          // deadline and may create another PayPal order. Do not release it here.
          await logAudit({ actorId: null, action: "auction.payment_attempt_failed", resource: "auction", resourceId: auction.auction_id, metadata: { orderId: payment.orderId, paypalStatus: status } }).catch(() => undefined);
        } else {
          await markRenewalOrderPaymentFailed(payment.orderId, `PayPal order is ${status.toLowerCase()}.`);
          await transitionOrderStatus({ orderId: payment.orderId, to: "FAILED", reason: "PayPal payment was not completed.", metadata: { provider: "paypal", paypalOrderId: payment.providerOrderId, paypalStatus: status } }).catch(() => undefined);
        }
        result.failed++;
        continue;
      }

      result.unchanged++;
    } catch {
      result.skipped++;
    }
  }

  return result;
}

function completedPaymentDetails(paypalOrder: Record<string, any>) {
  const purchaseUnit = Array.isArray(paypalOrder.purchase_units) ? paypalOrder.purchase_units[0] : undefined;
  const capture = purchaseUnit?.payments?.captures?.[0];
  const amount = capture?.amount ?? purchaseUnit?.amount;
  const value = typeof amount?.value === "string" ? Number(amount.value) : Number.NaN;
  return {
    cents: Number.isFinite(value) ? Math.round(value * 100) : -1,
    currency: typeof amount?.currency_code === "string" ? amount.currency_code.toUpperCase() : "",
    captureId: typeof capture?.id === "string" ? capture.id : null,
  };
}

async function findAuctionOrder(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{ auction_id: string; order_item_id: string | null; status: string }>>`
    SELECT "auction_id","order_item_id","status" FROM "auction_orders" WHERE "order_id"=${orderId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function reconcileCompletedAuctionPayment(params: { paymentId: string; orderId: string; captureId: string | null; auctionId: string }) {
  if (!params.captureId) return false;
  const order = await prisma.order.findUnique({ where: { id: params.orderId }, include: { user: true, items: true, invoice: true } });
  if (!order) return false;
  const auctionRows = await prisma.$queryRaw<Array<{ order_item_id: string | null; status: string }>>`
    SELECT "order_item_id","status" FROM "auction_orders" WHERE "auction_id"=${params.auctionId} AND "order_id"=${params.orderId} LIMIT 1
  `;
  const auction = auctionRows[0];
  if (!auction) return false;
  if (["FULFILLMENT_PENDING", "COMPLETED"].includes(auction.status)) return false;
  if (auction.status !== "PAYMENT_PENDING") return false;
  const item = auction.order_item_id ? order.items.find((candidate) => candidate.id === auction.order_item_id) : order.items[0];
  if (!item) return false;
  const invoiceNumber = order.invoice ? null : generateInvoiceNumber((await prisma.invoice.count()) + 1);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({ where: { id: params.paymentId, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { status: "PAID", providerCaptureId: params.captureId, failureReason: null } });
    if (claimed.count !== 1) return false;
    await tx.order.update({ where: { id: order.id }, data: { status: "PROVISIONING", provisioningError: null } });
    await tx.orderItem.update({ where: { id: item.id }, data: { provisioningStatus: "MANUAL_REVIEW", provisioningNote: "Payment reconciled. Registrar ownership delivery requires verification before completion." } });
    if (!order.invoice && invoiceNumber) {
      await tx.invoice.create({ data: { invoiceNumber, orderId: order.id, userId: order.userId, subtotalCents: order.subtotalCents, discountCents: order.discountCents, taxCents: order.taxCents, totalCents: order.totalCents, currency: order.currency, status: "PAID", paidAt: new Date(), billingName: `${order.user.firstName} ${order.user.lastName}`, billingEmail: order.user.email, billingCountry: order.user.country ?? undefined } });
    }
    await tx.ledgerEntry.create({ data: { userId: order.userId, creditCents: order.totalCents, source: "auction_order", reference: order.id, description: `Payment reconciled for auction order ${order.orderNumber}` } });
    await tx.$executeRaw`UPDATE "auction_orders" SET "status"='FULFILLMENT_PENDING', "provider_capture_id"=${params.captureId}, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${params.auctionId} AND "status"='PAYMENT_PENDING'`;
    await tx.auction.update({ where: { id: params.auctionId }, data: { status: "PAID" } });
    return true;
  });
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[character] as string));
}
