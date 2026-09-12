import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { checkoutSchema, priceCart, CheckoutError } from "@/lib/checkout";
import { validateDomainLifecycleCheckout } from "@/lib/checkout-domain-guard";
import { reservePricedPremiumCart, validatePricedPremiumCart, type ReservedPremiumItem } from "@/lib/premium-checkout";
import { releasePremiumReservation } from "@/lib/premium-aftermarket";
import { assertCatalogPriceFloors, validateCatalogCheckout } from "@/lib/catalog-checkout-guard";
import { validateProductCheckoutConfigurations } from "@/lib/product-checkout-config";
import { finalizeOrderCredit, releaseOrderCredit, reserveOrderCreditTx } from "@/lib/credits";
import { generateOrderNumber } from "@/lib/pricing";
import { encryptSecret } from "@/lib/crypto";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { provisionOrder } from "@/lib/provisioning";
import { recordPaymentSettlement } from "@/lib/finance";

const createOrderSchema = checkoutSchema.extend({ applyCredit: z.boolean().optional().default(false) });

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

    const rawBody = await req.json();
    const input = createOrderSchema.parse(rawBody);
    await validateDomainLifecycleCheckout(input, user.id);
    const productConfigurations = await validateProductCheckoutConfigurations(rawBody, input, user.id);
    const catalogFloors = await validateCatalogCheckout(input);
    const priced = await priceCart(input, user.id);
    await validatePricedPremiumCart(priced, user.id);
    assertCatalogPriceFloors(priced, catalogFloors);

    if (priced.totalCents <= 0) return jsonError("Order total must be greater than zero.", 400);

    reservedPremium = await reservePricedPremiumCart(priced, user.id);

    const idempotencyKey = crypto.randomUUID();
    const orderId = crypto.randomUUID();
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
    let creditAppliedCents = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await prisma.order.count();
      const orderNumber = generateOrderNumber(count + 1 + attempt);
      try {
        const result = await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              id: orderId,
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

          for (const configured of productConfigurations) {
            const orderItemId = itemIds[configured.itemIndex];
            if (!orderItemId) throw new Error("Product configuration linkage failed.");
            await tx.$executeRaw`
              INSERT INTO "product_order_configuration" ("order_item_id","domain_id","configuration")
              VALUES (${orderItemId},${configured.domainId},${JSON.stringify(configured.configuration)}::jsonb)
              ON CONFLICT ("order_item_id") DO UPDATE SET
                "domain_id"=EXCLUDED."domain_id",
                "configuration"=EXCLUDED."configuration",
                "updated_at"=CURRENT_TIMESTAMP
            `;
          }

          const credit = input.applyCredit
            ? await reserveOrderCreditTx(tx, { userId: user.id, orderId: created.id, maximumCents: priced.totalCents })
            : 0;
          return { created, credit };
        });
        order = result.created;
        creditAppliedCents = result.credit;
        break;
      } catch (error: any) {
        if (error?.code === "P2002" && attempt < 2) continue;
        throw error;
      }
    }
    if (!order) throw new Error("Failed to create order.");
    createdOrderId = order.id;

    const amountDueCents = Math.max(0, priced.totalCents - creditAppliedCents);

    if (amountDueCents === 0 && creditAppliedCents > 0) {
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          userId: user.id,
          provider: "credit",
          providerOrderId: `credit:${order.id}`,
          providerCaptureId: `credit:${order.id}`,
          amountCents: 0,
          currency: priced.currency,
          status: "PAID",
        },
      });
      await finalizeOrderCredit(order.id);
      await transitionOrderStatus({ orderId: order.id, to: "PAYMENT_CONFIRMED", reason: "Order paid in full using GetSawa account credit." });
      await recordPaymentSettlement({ paymentId: payment.id, providerReference: payment.providerCaptureId });
      checkoutReady = true;
      await logAudit({ actorId: user.id, action: "order.paid_with_credit", resource: "order", resourceId: order.id, ipAddress: ip, metadata: { creditAppliedCents } }).catch(() => undefined);
      await provisionOrder(order.id);
      const finalOrder = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
      return jsonOk({
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalCents: priced.totalCents,
        creditAppliedCents,
        amountDueCents: 0,
        currency: priced.currency,
        completedWithCredit: true,
        status: finalOrder?.status,
      });
    }

    if (!PayPalProvider.isConfigured()) {
      throw new CheckoutError("Payments are temporarily unavailable. Your account credit was not consumed.");
    }

    const paypalOrder = await PayPalProvider.createOrder({
      amountCents: amountDueCents,
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
        amountCents: amountDueCents,
        currency: priced.currency,
        status: "PENDING",
      },
    });

    const approveLink = paypalOrder.links?.find((link: any) => link.rel === "approve")?.href;
    if (!approveLink) throw new Error("The payment provider did not return an approval link.");

    checkoutReady = true;
    await logAudit({ actorId: user.id, action: "order.created", resource: "order", resourceId: order.id, ipAddress: ip, metadata: { creditAppliedCents, amountDueCents } }).catch((auditError) => {
      console.error("[audit] order.created failed", auditError);
    });

    return jsonOk({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: priced.totalCents,
      creditAppliedCents,
      amountDueCents,
      currency: priced.currency,
      paypalOrderId: paypalOrder.id,
      approveUrl: approveLink,
    });
  } catch (err) {
    if (!checkoutReady) {
      if (createdOrderId) {
        await releaseOrderCredit(createdOrderId).catch(() => undefined);
        await prisma.payment.updateMany({ where: { orderId: createdOrderId, status: "PENDING" }, data: { status: "FAILED", failureReason: "Payment handoff did not complete." } }).catch(() => undefined);
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
