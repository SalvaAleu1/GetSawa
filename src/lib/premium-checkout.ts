import { prisma } from "@/lib/prisma";
import { CheckoutError, type PricedCart } from "@/lib/checkout";
import { getPremiumListingForCheckout, reservePremiumInventory } from "@/lib/premium-aftermarket";

export interface ReservedPremiumItem {
  itemIndex: number;
  premiumDomainId: string;
}

/**
 * Static aftermarket inventory has a negotiated/listed retail price. Generic
 * cart promotions are not allowed to change it. Negotiated discounts use the
 * premium-offer workflow so custody, buyer identity and accepted price remain
 * auditable.
 */
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

/** Reserve listed premium inventory immediately before an order is created. */
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
