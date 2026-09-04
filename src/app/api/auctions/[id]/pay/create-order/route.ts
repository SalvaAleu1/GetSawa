import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/pricing";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const auction = await prisma.auction.findUnique({ where: { id: params.id }, include: { winningBid: true } });

    if (!auction || auction.status !== "ENDED" || !auction.winningBid) {
      return jsonError("This auction is not awaiting payment.", 400);
    }
    if (auction.winningBid.userId !== user.id) {
      return jsonError("You did not win this auction.", 403);
    }
    if (auction.paymentDeadline && auction.paymentDeadline < new Date()) {
      return jsonError("The payment window for this auction has passed. Please contact support.", 410);
    }
    if (!PayPalProvider.isConfigured()) {
      return jsonError("Payments are not currently available.", 503, { code: "PROVIDER_NOT_CONFIGURED" });
    }

    const idempotencyKey = `auction-${auction.id}-${user.id}`;
    const totalCents = auction.winningBid.amountCents;

    let order = await prisma.order.findFirst({ where: { idempotencyKey } });
    if (!order) {
      const count = await prisma.order.count();
      order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(count + 1),
          userId: user.id,
          status: "PENDING_PAYMENT",
          subtotalCents: totalCents,
          totalCents,
          idempotencyKey,
          items: {
            create: [
              {
                description: `Winning bid — ${auction.domainName} (auction)`,
                quantity: 1,
                years: 1,
                unitPriceCents: totalCents,
                totalCents,
              },
            ],
          },
        },
      });
    }

    if (order.status !== "PENDING_PAYMENT") {
      return jsonOk({ orderId: order.id, status: order.status });
    }

    const paypalOrder = await PayPalProvider.createOrder({
      amountCents: totalCents,
      currency: "USD",
      referenceId: order.id,
      description: `GetSawa auction win — ${auction.domainName}`,
      idempotencyKey,
      returnUrl: `${process.env.APP_URL}/domains/auctions/${auction.id}/confirm?orderId=${order.id}`,
      cancelUrl: `${process.env.APP_URL}/domains/auctions/${auction.id}`,
    });

    const existingPayment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    if (existingPayment) {
      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: { providerOrderId: paypalOrder.id, status: "PENDING" },
      });
    } else {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          userId: user.id,
          provider: "paypal",
          providerOrderId: paypalOrder.id,
          amountCents: totalCents,
          status: "PENDING",
        },
      });
    }

    const approveUrl = paypalOrder.links?.find((l: any) => l.rel === "approve")?.href;
    return jsonOk({ orderId: order.id, approveUrl });
  } catch (err) {
    return handleError(err);
  }
}
