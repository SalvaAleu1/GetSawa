import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { priceCart, DOMAIN_QUOTE_TTL_MS } from "@/lib/checkout";
import { refreshServiceRenewalOrderPrice } from "@/lib/service-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const order = await prisma.order.findFirst({ where: { id, userId: user.id }, include: { payments: true, items: true, invoice: true } });
    if (!order) return jsonError("Order not found.", 404);
    if (order.status !== "PENDING_PAYMENT") return jsonError("This order is no longer awaiting payment.", 409);

    const renewals = await prisma.$queryRaw<Array<{ subscription_id: string; domain_id: string | null; service_instance_id: string | null }>>`
      SELECT ra."subscription_id",bs."domain_id",bs."service_instance_id"
      FROM "billing_renewal_attempts" ra
      JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id"
      WHERE ra."order_id"=${order.id} AND ra."status" IN ('ORDER_CREATED','FAILED') LIMIT 1
    `;
    const renewal = renewals[0];
    if (!renewal) return jsonError("This order is not an eligible renewal invoice.", 400);
    if (!PayPalProvider.isConfigured()) return jsonError("Payments are not currently available.", 503, { code: "PROVIDER_NOT_CONFIGURED" });

    let amountCents: number;
    let currency: string;

    if (renewal.service_instance_id) {
      const quote = await refreshServiceRenewalOrderPrice({
        orderId: order.id,
        userId: user.id,
        subscriptionId: renewal.subscription_id,
        serviceInstanceId: renewal.service_instance_id,
      });
      amountCents = quote.renewalPriceCents;
      currency = quote.currency;
    } else if (renewal.domain_id) {
      const priced = await priceCart({ items: [{ kind: "DOMAIN_RENEWAL", domainId: renewal.domain_id, years: 1 }] }, user.id);
      const line = priced.items[0];
      if (!line || line.kind !== "DOMAIN_RENEWAL") return jsonError("A current renewal price could not be verified.", 409);
      amountCents = priced.totalCents;
      currency = priced.currency;

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { subtotalCents: priced.subtotalCents, discountCents: priced.discountCents, totalCents: priced.totalCents, currency: priced.currency } });
        const item = order.items[0];
        if (item) await tx.orderItem.update({ where: { id: item.id }, data: { description: line.description, unitPriceCents: line.unitPriceCents, discountCents: line.discountCents, totalCents: line.totalCents } });
        if (order.invoice) await tx.invoice.update({ where: { id: order.invoice.id }, data: { subtotalCents: priced.subtotalCents, discountCents: priced.discountCents, totalCents: priced.totalCents, currency: priced.currency } });
        await tx.$executeRaw`UPDATE "billing_subscriptions" SET "amount_cents"=${priced.totalCents},"currency"=${priced.currency},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${renewal.subscription_id}`;
      });
    } else {
      return jsonError("Renewal subscription has no supported service reference.", 409);
    }

    const recentPending = order.payments.find((payment) =>
      payment.status === "PENDING" && payment.providerOrderId && payment.amountCents === amountCents && payment.currency.toUpperCase() === currency.toUpperCase() && Date.now() - payment.createdAt.getTime() <= DOMAIN_QUOTE_TTL_MS,
    );
    if (recentPending?.providerOrderId) {
      const providerOrder = await PayPalProvider.getOrder(recentPending.providerOrderId);
      const approveUrl = Array.isArray(providerOrder.links) ? providerOrder.links.find((link: unknown) => typeof link === "object" && link !== null && (link as { rel?: unknown }).rel === "approve")?.href : undefined;
      if (approveUrl) return jsonOk({ orderId: order.id, paypalOrderId: recentPending.providerOrderId, approveUrl });
    }

    await prisma.payment.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "EXPIRED", failureReason: "Superseded by a fresh renewal price/payment attempt." },
    });

    const attemptNumber = order.payments.length + 1;
    const idempotencyKey = `renewal-pay:${order.id}:${attemptNumber}:${amountCents}`;
    const paypalOrder = await PayPalProvider.createOrder({
      amountCents,
      currency,
      referenceId: order.id,
      description: `GetSawa renewal ${order.orderNumber}`,
      idempotencyKey,
      returnUrl: `${process.env.APP_URL}/dashboard/orders/${order.id}?payment=success`,
      cancelUrl: `${process.env.APP_URL}/dashboard/orders/${order.id}?payment=cancelled`,
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, userId: user.id, provider: "paypal", providerOrderId: paypalOrder.id, amountCents, currency, status: "PENDING" },
    });
    await prisma.$executeRaw`
      UPDATE "billing_renewal_attempts" SET "status"='ORDER_CREATED',"attempted_at"=CURRENT_TIMESTAMP,"failure_code"=NULL,"failure_message"=NULL,"updated_at"=CURRENT_TIMESTAMP WHERE "order_id"=${order.id}
    `;
    const approveUrl = Array.isArray(paypalOrder.links) ? paypalOrder.links.find((link: unknown) => typeof link === "object" && link !== null && (link as { rel?: unknown }).rel === "approve")?.href : undefined;
    if (!approveUrl) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "PayPal did not return an approval URL." } });
      await prisma.$executeRaw`
        UPDATE "billing_renewal_attempts" SET "status"='FAILED',"failure_code"='HANDOFF_FAILED',"failure_message"='PayPal did not return an approval URL.',"updated_at"=CURRENT_TIMESTAMP WHERE "order_id"=${order.id}
      `;
      return jsonError("PayPal did not return an approval URL.", 502);
    }
    return jsonOk({ orderId: order.id, paypalOrderId: paypalOrder.id, approveUrl });
  } catch (error) {
    return handleError(error);
  }
}
