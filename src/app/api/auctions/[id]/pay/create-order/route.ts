import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/pricing";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { AuctionError, markAuctionPaymentCreated } from "@/lib/auctions";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const auction = await prisma.auction.findUnique({ where: { id }, include: { winningBid: true } });
    if (!auction || auction.status !== "ENDED" || !auction.winningBid) return jsonError("This auction is not awaiting winner payment.", 409);
    if (auction.winningBid.userId !== user.id) return jsonError("You are not the winning bidder for this auction.", 403);

    const rows = await prisma.$queryRaw<Array<{
      status: string;
      winner_user_id: string;
      amount_cents: number;
      currency: string;
      payment_deadline: Date | null;
      order_id: string | null;
      premium_domain_id: string;
    }>>`
      SELECT ao."status",ao."winner_user_id",ao."amount_cents",ao."currency",ao."payment_deadline",ao."order_id",ai."premium_domain_id"
      FROM "auction_orders" ao JOIN "auction_inventory" ai ON ai."auction_id"=ao."auction_id"
      WHERE ao."auction_id"=${id} LIMIT 1
    `;
    const auctionOrder = rows[0];
    if (!auctionOrder || auctionOrder.winner_user_id !== user.id) return jsonError("Auction payment record is unavailable.", 409);
    if (auctionOrder.status !== "PAYMENT_PENDING") return jsonOk({ status: auctionOrder.status, orderId: auctionOrder.order_id });
    if (!auctionOrder.payment_deadline || auctionOrder.payment_deadline.getTime() <= Date.now()) return jsonError("The winner payment window has expired.", 410);
    if (auctionOrder.amount_cents !== auction.winningBid.amountCents) return jsonError("Auction winner amount does not match the payment record.", 409);
    if (!PayPalProvider.isConfigured()) return jsonError("Payments are temporarily unavailable. Please try again later.", 503, { code: "PROVIDER_NOT_CONFIGURED" });

    const idempotencyKey = `auction:${auction.id}:${user.id}`;
    let order = auctionOrder.order_id ? await prisma.order.findUnique({ where: { id: auctionOrder.order_id }, include: { items: true } }) : null;
    if (!order) {
      const count = await prisma.order.count();
      const itemId = crypto.randomUUID();
      order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(count + 1),
            userId: user.id,
            status: "PENDING_PAYMENT",
            subtotalCents: auctionOrder.amount_cents,
            discountCents: 0,
            taxCents: 0,
            totalCents: auctionOrder.amount_cents,
            currency: auctionOrder.currency,
            idempotencyKey,
            items: { create: [{ id: itemId, description: `${auction.domainName} auction purchase`, quantity: 1, unitPriceCents: auctionOrder.amount_cents, discountCents: 0, totalCents: auctionOrder.amount_cents }] },
          },
          include: { items: true },
        });
        await tx.$executeRaw`
          INSERT INTO "premium_order_links" ("order_item_id","premium_domain_id","premium_offer_id")
          VALUES (${itemId},${auctionOrder.premium_domain_id},NULL)
          ON CONFLICT ("order_item_id") DO NOTHING
        `;
        await tx.$executeRaw`UPDATE "auction_orders" SET "order_id"=${created.id}, "order_item_id"=${itemId}, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${auction.id} AND "status"='PAYMENT_PENDING'`;
        return created;
      });
    }
    if (order.status !== "PENDING_PAYMENT") return jsonOk({ orderId: order.id, status: order.status });
    const orderItem = order.items[0] ?? await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    if (!orderItem) return jsonError("Auction order item is missing.", 409);

    const paypalOrder = await PayPalProvider.createOrder({
      amountCents: auctionOrder.amount_cents,
      currency: auctionOrder.currency,
      referenceId: order.id,
      description: `GetSawa auction win — ${auction.domainName}`,
      idempotencyKey: `paypal-${idempotencyKey}`,
      returnUrl: `${process.env.APP_URL}/domains/auctions/${auction.id}/confirm?orderId=${order.id}`,
      cancelUrl: `${process.env.APP_URL}/domains/auctions/${auction.id}?payment=cancelled`,
    });
    const approveUrl = paypalOrder.links?.find((link: any) => link.rel === "approve")?.href;
    if (!approveUrl) return jsonError("The payment provider did not return an approval link.", 502);

    const existingPayment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    if (existingPayment) {
      if (existingPayment.status === "PAID") return jsonOk({ orderId: order.id, status: order.status });
      await prisma.payment.update({ where: { id: existingPayment.id }, data: { providerOrderId: paypalOrder.id, amountCents: auctionOrder.amount_cents, currency: auctionOrder.currency, status: "PENDING", failureReason: null } });
    } else {
      await prisma.payment.create({ data: { orderId: order.id, userId: user.id, provider: "paypal", providerOrderId: paypalOrder.id, amountCents: auctionOrder.amount_cents, currency: auctionOrder.currency, status: "PENDING" } });
    }
    await markAuctionPaymentCreated({ auctionId: auction.id, winnerUserId: user.id, orderId: order.id, orderItemId: orderItem.id, providerOrderId: paypalOrder.id });
    await logAudit({ actorId: user.id, action: "auction.payment_started", resource: "auction", resourceId: auction.id, metadata: { orderId: order.id, amountCents: auctionOrder.amount_cents } });
    return jsonOk({ orderId: order.id, orderNumber: order.orderNumber, totalCents: auctionOrder.amount_cents, currency: auctionOrder.currency, approveUrl });
  } catch (err) {
    if (err instanceof AuctionError) return jsonError(err.message, 409);
    return handleError(err);
  }
}
