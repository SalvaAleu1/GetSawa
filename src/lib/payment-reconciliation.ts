import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { provisionOrder } from "@/lib/provisioning";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { notifyOrderLifecycle } from "@/lib/order-notifications";
import { markRenewalPaid, markRenewalOrderPaymentFailed } from "@/lib/billing";

export interface ReconciliationResult {
  inspected: number;
  confirmed: number;
  failed: number;
  unchanged: number;
  skipped: number;
}

/**
 * Reconciles recent pending PayPal payments against PayPal's authoritative
 * order state. This is a safety net for lost browser callbacks/webhooks; it
 * never charges a customer and never trusts client-supplied payment status.
 */
export async function reconcilePendingPayPalPayments(limit = 50): Promise<ReconciliationResult> {
  if (!PayPalProvider.isConfigured()) throw new Error("PayPal is not configured.");

  const payments = await prisma.payment.findMany({
    where: {
      provider: "paypal",
      status: { in: ["PENDING", "AUTHORIZED"] },
      providerOrderId: { not: null },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { order: { include: { user: true } } },
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
        const purchaseUnit = Array.isArray(paypalOrder.purchase_units) ? paypalOrder.purchase_units[0] as Record<string, unknown> | undefined : undefined;
        const amount = purchaseUnit?.amount as Record<string, unknown> | undefined;
        const value = typeof amount?.value === "string" ? Number(amount.value) : Number.NaN;
        const currency = typeof amount?.currency_code === "string" ? amount.currency_code.toUpperCase() : "";
        const cents = Number.isFinite(value) ? Math.round(value * 100) : -1;
        if (cents !== payment.amountCents || currency !== payment.currency.toUpperCase()) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: "PayPal reconciliation amount or currency mismatch." } });
          result.skipped++;
          continue;
        }

        await prisma.payment.updateMany({ where: { id: payment.id, status: { not: "PAID" } }, data: { status: "PAID" } });
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

      if (["VOIDED", "CANCELLED"].includes(status)) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: `PayPal order is ${status.toLowerCase()}.` } });
        await markRenewalOrderPaymentFailed(payment.orderId, `PayPal order is ${status.toLowerCase()}.`);
        await transitionOrderStatus({ orderId: payment.orderId, to: "FAILED", reason: "PayPal payment was not completed.", metadata: { provider: "paypal", paypalOrderId: payment.providerOrderId, paypalStatus: status } }).catch(() => undefined);
        result.failed++;
        continue;
      }

      result.unchanged++;
    } catch {
      // One provider/network failure must not prevent reconciliation of the
      // remaining payments. The next scheduled run will retry it.
      result.skipped++;
    }
  }

  return result;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[c] as string));
}
