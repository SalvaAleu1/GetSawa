import { NextRequest } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { generateOrderNumber } from "@/lib/pricing";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { getPremiumListingForCheckout, reservePremiumInventory } from "@/lib/premium-aftermarket";
import { releaseOrRestorePremiumOrderReservations } from "@/lib/premium-checkout";
import { validatePremiumMarketplaceEconomics } from "@/lib/premium-economics";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  let createdOrderId: string | null = null;
  let premiumDomainId: string | null = null;
  let buyerId: string | null = null;
  let acceptedOfferExpiry: Date | null = null;
  let checkoutReady = false;

  try {
    const user = await requireUser();
    buyerId = user.id;
    const ip = getClientIp(req.headers);
    const rate = checkRateLimit("premium-offer-checkout", user.id, { max: 10, windowMs: 60_000 });
    if (!rate.allowed) return jsonError("Too many checkout attempts. Please wait and try again.", 429);
    if (!PayPalProvider.isConfigured()) return jsonError("Payments are temporarily unavailable. Please try again later.", 503);

    const { id } = await params;
    const rows = await prisma.$queryRaw<Array<{
      premium_domain_id: string;
      status: string;
      accepted_price_cents: number | null;
      expires_at: Date | null;
    }>>`
      SELECT "premium_domain_id","status","accepted_price_cents","expires_at"
      FROM "premium_offers"
      WHERE "id"=${id} AND "buyer_user_id"=${user.id}
      LIMIT 1
    `;
    const offer = rows[0];
    if (!offer) return jsonError("Offer not found.", 404);
    if (offer.status !== "ACCEPTED" || offer.accepted_price_cents == null) return jsonError("This offer is not approved for checkout.", 409);
    if (!offer.expires_at || offer.expires_at.getTime() <= Date.now()) return jsonError("This accepted offer has expired.", 409);
    premiumDomainId = offer.premium_domain_id;
    acceptedOfferExpiry = offer.expires_at;

    const verified = await getPremiumListingForCheckout(offer.premium_domain_id, user.id, id);
    if (verified.meta.sellerUserId === user.id) return jsonError("You cannot purchase your own aftermarket domain.", 400);
    if (verified.listing.currency !== "USD") return jsonError("This negotiated checkout is not available in the listing currency.", 409);
    if (verified.meta.source !== "GETSAWA_INVENTORY" && verified.meta.source !== "CUSTOMER_CUSTODY") return jsonError("This premium inventory source does not support negotiated checkout.", 409);
    await validatePremiumMarketplaceEconomics({
      source: verified.meta.source,
      salePriceCents: verified.priceCents,
      acquisitionCostCents: verified.meta.acquisitionCostCents,
      commissionBps: verified.meta.commissionBps,
    });

    const existing = await prisma.$queryRaw<Array<{ order_id: string; order_number: string; provider_order_id: string }>>`
      SELECT o."id" AS order_id, o."orderNumber" AS order_number, p."providerOrderId" AS provider_order_id
      FROM "premium_order_links" pol
      JOIN "OrderItem" oi ON oi."id"=pol."order_item_id"
      JOIN "Order" o ON o."id"=oi."orderId"
      JOIN "Payment" p ON p."orderId"=o."id"
      WHERE pol."premium_offer_id"=${id}
        AND o."userId"=${user.id}
        AND o."status"='PENDING_PAYMENT'
        AND p."status"='PENDING'
      ORDER BY o."createdAt" DESC
      LIMIT 1
    `;
    if (existing[0]?.provider_order_id) {
      const paypal = await PayPalProvider.getOrder(existing[0].provider_order_id);
      const approveUrl = paypal.links?.find((link: any) => link.rel === "approve")?.href;
      if (approveUrl) return jsonOk({ orderId: existing[0].order_id, orderNumber: existing[0].order_number, totalCents: verified.priceCents, currency: verified.listing.currency, paypalOrderId: existing[0].provider_order_id, approveUrl });
    }

    await reservePremiumInventory(offer.premium_domain_id, user.id);
    const itemId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
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
              subtotalCents: verified.priceCents,
              discountCents: 0,
              taxCents: 0,
              totalCents: verified.priceCents,
              currency: verified.listing.currency,
              idempotencyKey,
              items: { create: [{ id: itemId, description: `${verified.listing.domainName} premium domain purchase`, quantity: 1, years: 1, unitPriceCents: verified.priceCents, discountCents: 0, totalCents: verified.priceCents }] },
            },
            include: { items: true },
          });
          await tx.$executeRaw`
            INSERT INTO "premium_order_links" ("order_item_id","premium_domain_id","premium_offer_id")
            VALUES (${itemId},${offer.premium_domain_id},${id})
          `;
          return created;
        });
        break;
      } catch (error: any) {
        if (error?.code === "P2002" && attempt < 2) continue;
        throw error;
      }
    }
    if (!order) throw new Error("Could not create the premium-domain order.");
    createdOrderId = order.id;

    const paypalOrder = await PayPalProvider.createOrder({
      amountCents: verified.priceCents,
      currency: verified.listing.currency,
      referenceId: order.id,
      description: `GetSawa order ${order.orderNumber}`,
      idempotencyKey,
      returnUrl: `${process.env.APP_URL}/checkout/confirm?orderId=${order.id}`,
      cancelUrl: `${process.env.APP_URL}/dashboard/marketplace?payment=cancelled`,
    });
    const approveUrl = paypalOrder.links?.find((link: any) => link.rel === "approve")?.href;
    if (!approveUrl) throw new Error("The payment provider did not return an approval link.");

    await prisma.payment.create({ data: { orderId: order.id, userId: user.id, provider: "paypal", providerOrderId: paypalOrder.id, amountCents: verified.priceCents, currency: verified.listing.currency, status: "PENDING" } });
    checkoutReady = true;
    await logAudit({ actorId: user.id, action: "premium_offer.checkout_created", resource: "order", resourceId: order.id, ipAddress: ip, metadata: { offerId: id, premiumDomainId: offer.premium_domain_id, amountCents: verified.priceCents } }).catch(() => undefined);
    return jsonOk({ orderId: order.id, orderNumber: order.orderNumber, totalCents: verified.priceCents, currency: verified.listing.currency, paypalOrderId: paypalOrder.id, approveUrl });
  } catch (err) {
    if (!checkoutReady && createdOrderId && buyerId) {
      await prisma.order.updateMany({ where: { id: createdOrderId, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", provisioningError: "Negotiated premium checkout did not complete." } }).catch(() => undefined);
      await releaseOrRestorePremiumOrderReservations(createdOrderId, buyerId).catch(() => undefined);
    } else if (!checkoutReady && premiumDomainId && buyerId && acceptedOfferExpiry) {
      await prisma.$executeRaw`
        UPDATE "premium_inventory_meta"
        SET "reserved_by_user_id"=${buyerId}, "reserved_until"=${acceptedOfferExpiry}, "updated_at"=CURRENT_TIMESTAMP
        WHERE "premium_domain_id"=${premiumDomainId} AND "sold_at" IS NULL
      `.catch(() => undefined);
    }
    const message = err instanceof Error ? err.message : "Could not start premium-domain checkout.";
    if (message.includes("offer") || message.includes("domain") || message.includes("price") || message.includes("commission") || message.includes("minimum") || message.includes("reserved")) return jsonError(message, 400);
    return handleError(err);
  }
}
