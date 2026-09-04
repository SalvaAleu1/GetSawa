import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { checkoutSchema, priceCart, CheckoutError } from "@/lib/checkout";
import { generateOrderNumber } from "@/lib/pricing";
import { encryptSecret } from "@/lib/crypto";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("create-order", user.id, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many checkout attempts. Please slow down.", 429);

    const input = checkoutSchema.parse(await req.json());
    const priced = await priceCart(input, user.id);

    if (priced.totalCents <= 0) {
      return jsonError("Order total must be greater than zero.", 400);
    }

    if (!PayPalProvider.isConfigured()) {
      return jsonError("Payments are not currently available. The payment provider has not been configured yet.", 503, {
        code: "PROVIDER_NOT_CONFIGURED",
      });
    }

    const idempotencyKey = crypto.randomUUID();

    const transferRecords = new Map<number, string>();
    for (let i = 0; i < priced.items.length; i++) {
      const item = priced.items[i];
      if (!item) continue;
      if (item.kind === "DOMAIN_TRANSFER" && item.authCode && item.domain) {
        const transfer = await prisma.domainTransfer.create({
          data: {
            userId: user.id,
            domainName: item.domain,
            authCodeEncrypted: encryptSecret(item.authCode),
            status: "AWAITING_PAYMENT",
          },
        });
        transferRecords.set(i, transfer.id);
      }
    }

    let order;
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await prisma.order.count();
      const orderNumber = generateOrderNumber(count + 1 + attempt);
      try {
        order = await prisma.order.create({
          data: {
            orderNumber,
            userId: user.id,
            status: "PENDING_PAYMENT",
            subtotalCents: priced.subtotalCents,
            discountCents: priced.discountCents,
            taxCents: 0,
            totalCents: priced.totalCents,
            currency: priced.currency,
            couponCode: priced.appliedCouponCode,
            promotionId: priced.appliedPromotionId,
            idempotencyKey,
            items: {
              create: priced.items.map((item, i) => ({
                productId: item.productId,
                domainId: item.domainId,
                domainTransferId: transferRecords.get(i),
                description: item.description,
                quantity: item.quantity,
                years: item.years,
                unitPriceCents: item.unitPriceCents,
                discountCents: item.discountCents,
                totalCents: item.totalCents,
              })),
            },
          },
          include: { items: true },
        });
        break;
      } catch (e: any) {
        if (e.code === "P2002" && attempt < 2) continue;
        throw e;
      }
    }
    if (!order) throw new Error("Failed to create order.");

    const paypalOrder = await PayPalProvider.createOrder({
      amountCents: priced.totalCents,
      currency: priced.currency,
      referenceId: order.id,
      description: `GetSawa order ${order.orderNumber}`,
      idempotencyKey,
      returnUrl: `${process.env.APP_URL}/checkout/confirm?orderId=${order.id}`,
      cancelUrl: `${process.env.APP_URL}/checkout?cancelled=1`,
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        userId: user.id,
        provider: "paypal",
        providerOrderId: paypalOrder.id,
        amountCents: priced.totalCents,
        currency: priced.currency,
        status: "PENDING",
      },
    });

    await logAudit({ actorId: user.id, action: "order.created", resource: "order", resourceId: order.id, ipAddress: ip });

    const approveLink = paypalOrder.links?.find((l: any) => l.rel === "approve")?.href;

    return jsonOk({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: priced.totalCents,
      currency: priced.currency,
      paypalOrderId: paypalOrder.id,
      approveUrl: approveLink,
    });
  } catch (err) {
    if (err instanceof CheckoutError) return jsonError(err.message, 400);
    return handleError(err);
  }
}
