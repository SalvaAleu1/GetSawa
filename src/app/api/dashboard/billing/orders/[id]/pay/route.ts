import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const order = await prisma.order.findFirst({ where: { id, userId: user.id }, include: { payments: true, items: true } });
    if (!order) return jsonError("Order not found.", 404);
    if (order.status !== "PENDING_PAYMENT") return jsonError("This order is no longer awaiting payment.", 409);
    const renewal = await prisma.$queryRaw<{ subscription_id: string }[]>`
      SELECT "subscription_id" FROM "billing_renewal_attempts" WHERE "order_id" = ${order.id} AND "status" IN ('ORDER_CREATED','FAILED') LIMIT 1
    `;
    if (!renewal[0]) return jsonError("This order is not a renewable billing invoice.", 400);
    if (!PayPalProvider.isConfigured()) return jsonError("Payments are not currently available.", 503, { code: "PROVIDER_NOT_CONFIGURED" });

    const existing = order.payments.find((payment) => payment.status === "PENDING" && payment.providerOrderId);
    if (existing?.providerOrderId) return jsonOk({ orderId: order.id, paypalOrderId: existing.providerOrderId, approveUrl: undefined });

    const idempotencyKey = `renewal-pay:${order.id}`;
    const paypalOrder = await PayPalProvider.createOrder({
      amountCents: order.totalCents, currency: order.currency, referenceId: order.id,
      description: `GetSawa renewal ${order.orderNumber}`, idempotencyKey,
      returnUrl: `${process.env.APP_URL}/dashboard/orders/${order.id}?payment=success`,
      cancelUrl: `${process.env.APP_URL}/dashboard/orders/${order.id}?payment=cancelled`,
    });
    await prisma.payment.create({ data: { orderId: order.id, userId: user.id, provider: "paypal", providerOrderId: paypalOrder.id, amountCents: order.totalCents, currency: order.currency, status: "PENDING" } });
    await prisma.$executeRaw`
      UPDATE "billing_renewal_attempts" SET "status" = 'ORDER_CREATED', "attempted_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP WHERE "order_id" = ${order.id}
    `;
    const approveUrl = Array.isArray(paypalOrder.links) ? paypalOrder.links.find((link: unknown) => typeof link === "object" && link !== null && (link as { rel?: unknown }).rel === "approve")?.href : undefined;
    return jsonOk({ orderId: order.id, paypalOrderId: paypalOrder.id, approveUrl, requestId: crypto.randomUUID() });
  } catch (error) {
    return handleError(error);
  }
}
