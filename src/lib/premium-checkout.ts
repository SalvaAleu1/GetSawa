import { prisma } from "@/lib/prisma";
import { CheckoutError, type PricedCart } from "@/lib/checkout";
import { getPremiumListingForCheckout, reservePremiumInventory } from "@/lib/premium-aftermarket";

export interface ReservedPremiumItem {
  itemIndex: number;
  premiumDomainId: string;
}

export async function validatePricedPremiumCart(priced: PricedCart, buyerUserId: string) {
  const seen = new Set<string>();
  for (const item of priced.items) {
    if (item.pricingSource !== "GETSAWA_PREMIUM_LISTING") continue;
    if (!item.domain) throw new CheckoutError("Premium domain checkout is missing its domain reference.");
    const listing = await prisma.premiumDomain.findUnique({ where: { domainName: item.domain.toLowerCase() } });
    if (!listing || listing.status !== "LISTED") throw new CheckoutError(`${item.domain} is no longer available.`);
    if (seen.has(listing.id)) throw new CheckoutError(`${item.domain} can only appear once in an order.`);
    seen.add(listing.id);

    const verified = await getPremiumListingForCheckout(listing.id, buyerUserId);
    if (verified.meta.sellerUserId === buyerUserId) throw new CheckoutError("You cannot purchase your own aftermarket domain.");
    if (item.quantity !== 1 || item.unitPriceCents !== listing.purchasePriceCents || item.totalCents !== listing.purchasePriceCents || item.discountCents !== 0) {
      throw new CheckoutError(`Promotions and coupons do not apply to ${listing.domainName}. Use the domain offer option when available.`);
    }
  }
}

export async function reservePricedPremiumCart(priced: PricedCart, buyerUserId: string): Promise<ReservedPremiumItem[]> {
  const reserved: ReservedPremiumItem[] = [];
  for (let index = 0; index < priced.items.length; index++) {
    const item = priced.items[index];
    if (!item || item.pricingSource !== "GETSAWA_PREMIUM_LISTING" || !item.domain) continue;
    const listing = await prisma.premiumDomain.findUnique({ where: { domainName: item.domain.toLowerCase() } });
    if (!listing || listing.status !== "LISTED") throw new CheckoutError(`${item.domain} is no longer available.`);
    await reservePremiumInventory(listing.id, buyerUserId);
    reserved.push({ itemIndex: index, premiumDomainId: listing.id });
  }
  return reserved;
}

export async function assertPremiumOrderReservations(orderId: string, buyerUserId: string) {
  const rows = await prisma.$queryRaw<Array<{
    premium_domain_id: string;
    domain_name: string;
    status: string;
    reserved_by_user_id: string | null;
    reserved_until: Date | null;
    sold_at: Date | null;
  }>>`
    SELECT pol."premium_domain_id",
           pd."domainName" AS domain_name,
           pd."status",
           pim."reserved_by_user_id",
           pim."reserved_until",
           pim."sold_at"
    FROM "premium_order_links" pol
    JOIN "OrderItem" oi ON oi."id"=pol."order_item_id"
    JOIN "PremiumDomain" pd ON pd."id"=pol."premium_domain_id"
    JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=pol."premium_domain_id"
    WHERE oi."orderId"=${orderId}
  `;

  for (const row of rows) {
    if (row.sold_at || !["LISTED", "RESERVED"].includes(row.status)) throw new CheckoutError(`${row.domain_name} is no longer available for this order.`);
    if (row.reserved_by_user_id !== buyerUserId) throw new CheckoutError(`${row.domain_name} is no longer reserved for your account.`);
    if (row.status === "LISTED" && (!row.reserved_until || row.reserved_until.getTime() <= Date.now())) {
      throw new CheckoutError(`${row.domain_name}'s checkout reservation expired. Start checkout again to reserve it.`);
    }
  }
}

/**
 * Release a Buy Now reservation, or restore an accepted offer's longer
 * purchase window. This is used only before a payment is captured.
 */
export async function releaseOrRestorePremiumOrderReservations(orderId: string, buyerUserId: string) {
  const rows = await prisma.$queryRaw<Array<{
    premium_domain_id: string;
    premium_offer_id: string | null;
    offer_status: string | null;
    offer_expires_at: Date | null;
  }>>`
    SELECT pol."premium_domain_id", pol."premium_offer_id",
           po."status" AS offer_status, po."expires_at" AS offer_expires_at
    FROM "premium_order_links" pol
    JOIN "OrderItem" oi ON oi."id"=pol."order_item_id"
    LEFT JOIN "premium_offers" po ON po."id"=pol."premium_offer_id"
    WHERE oi."orderId"=${orderId}
  `;

  for (const row of rows) {
    const restoreOffer = row.premium_offer_id && row.offer_status === "ACCEPTED" && row.offer_expires_at && row.offer_expires_at.getTime() > Date.now();
    if (restoreOffer) {
      await prisma.$executeRaw`
        UPDATE "premium_inventory_meta"
        SET "reserved_by_user_id"=${buyerUserId}, "reserved_until"=${row.offer_expires_at}, "updated_at"=CURRENT_TIMESTAMP
        WHERE "premium_domain_id"=${row.premium_domain_id} AND "sold_at" IS NULL
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "premium_inventory_meta"
        SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP
        WHERE "premium_domain_id"=${row.premium_domain_id} AND "reserved_by_user_id"=${buyerUserId} AND "sold_at" IS NULL
      `;
    }
  }
}
