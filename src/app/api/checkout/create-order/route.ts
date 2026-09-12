import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { checkoutSchema, priceCart, CheckoutError } from "@/lib/checkout";
import { validateDomainLifecycleCheckout } from "@/lib/checkout-domain-guard";
import { reservePricedPremiumCart, validatePricedPremiumCart, type ReservedPremiumItem } from "@/lib/premium-checkout";
import { releasePremiumReservation } from "@/lib/premium-aftermarket";
import { assertCatalogPriceFloors, validateCatalogCheckout } from "@/lib/catalog-checkout-guard";
import { generateOrderNumber } from "@/lib/pricing";
import { encryptSecret } from "@/lib/crypto";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  let reservationOwnerId: string | null = null;
  let reservedPremium: ReservedPremiumItem[] = [];
  let createdOrderId: string | null = null;
  const transferRecordIds: string[] = [];
  let checkoutReady = false;

  try {
    const user = await requireUser();
    reservationOwnerId = user.id;
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("create-order", user.id, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many checkout attempts. Please slow down.", 429);

    const input = checkoutSchema.parse(await req.json());
    await validateDomainLifecycleCheckout(input, user.id);
    const catalogFloors = await validateCatalogCheckout(input);
    const priced = await priceCart(input, user.id);
    await validatePricedPremiumCart(priced, user.id);
    assertCatalogPriceFloors(priced, catalogFloors);

    if (priced.totalCents <= 0) return jsonError("Order total must be greater than zero.", 400);
    if (!PayPalProvider.isConfigured()) {
      return jsonError("Payments are temporarily unavailable. Please try again later.", 503, { code: "PROVIDER_NOT_CONFIGURED" });
    }

    // Premium aftermarket inventory is reserved only at the final order step,
    // never at search or quote preview. The reservation is rechecked before capture.
    reservedPremium = await reservePricedPremiumCart(priced, user.id);

    const idempotencyKey = crypto.randomUUID();
    const itemIds = priced.items.map(() => crypto.randomUUID());
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
        transferRecordIds.push(transfer.id);
      }
    }

    let order;
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await prisma.order.count();
      const orderNumber = generateOrderNumber(count + 1 + attempt);
      try {
        order = await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
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
                  id: itemIds[i],
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

          for (const reserved of reservedPremium) {
            const orderItemId = itemIds[reserved.itemIndex];
            if (!orderItemId) throw new Error("Premium order item linkage failed.");
            await tx.$executeRaw`
              INSERT INTO "premium_order_links" ("order_item_id","premium_domain_id","premium_offer_id")
              VALUES (${orderItemId},${reserved.premiumDomainId},NULL)
              ON CONFLICT ("order_item_id") DO NOTHING
            `;
          }
          return created;
        });
        break;
      } catch (error: any) {
        if (error?.code === "P2002" && attempt < 2) continue;
        throw error;
      }
    }
    if (!order) throw new Error("Failed to create order.");
    createdOrderId = order.id;

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

    checkoutReady = true;
    await logAudit({ actorId: user.id, action: "order.created", resource: "order", resourceId: order.id, ipAddress: ip }).catch((auditError) => {
      console.error("[audit] order.created failed", auditError);
    });

    const approveLink = paypalOrder.links?.find((link: any) => link.rel === "approve")?.href;
    if (!approveLink) throw new Error("The payment provider did not return an approval link.");

    return jsonOk({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: priced.totalCents,
      currency: priced.currency,
      paypalOrderId: paypalOrder.id,
      approveUrl: approveLink,
    });
  } catch (err) {
    if (!checkoutReady) {
      if (createdOrderId) {
        await prisma.order.updateMany({ where: { id: createdOrderId, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", provisioningError: "Checkout setup failed before payment approval." } }).catch(() => undefined);
      }
      if (transferRecordIds.length > 0) {
        await prisma.domainTransfer.updateMany({ where: { id: { in: transferRecordIds }, status: "AWAITING_PAYMENT" }, data: { status: "CANCELLED", failureReason: "Checkout setup did not complete." } }).catch(() => undefined);
      }
      if (reservationOwnerId && reservedPremium.length > 0) {
        await Promise.allSettled(reservedPremium.map((item) => releasePremiumReservation(item.premiumDomainId, reservationOwnerId as string)));
      }
    }
    if (err instanceof CheckoutError) return jsonError(err.message, 400);
    return handleError(err);
  }
}
