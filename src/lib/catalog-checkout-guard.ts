import { prisma } from "@/lib/prisma";
import { CheckoutError, type CheckoutInput, type PricedCart } from "@/lib/checkout";
import { getProductCommerceMeta, getProductReadiness } from "@/lib/product-readiness";

interface CatalogFloor {
  index: number;
  sku: string;
  minimumTotalCents: number;
}

/**
 * Product ACTIVE state is necessary but never sufficient for taking money.
 * Re-check cost/provider/billing readiness at every quote and final order so a
 * provider outage or stale product row cannot bypass the catalog safety gate.
 */
export async function validateCatalogCheckout(input: CheckoutInput): Promise<CatalogFloor[]> {
  const floors: CatalogFloor[] = [];
  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index];
    if (!item || item.kind !== "PRODUCT") continue;
    const product = await prisma.product.findUnique({ where: { sku: item.sku } });
    if (!product || product.status !== "ACTIVE") throw new CheckoutError("This product is not currently available.");
    const meta = await getProductCommerceMeta(product.id);
    const readiness = await getProductReadiness(product, meta);
    if (!readiness.purchasable || readiness.minimumRetailCents == null) {
      throw new CheckoutError(readiness.reasons[0] || "This product is temporarily unavailable.");
    }

    // Supported catalog contracts currently require customer-specific domain
    // configuration. Their full purchase UX is delivered in the provider
    // phases (15/16). Until then, fail closed rather than accept money without
    // enough information to provision the paid service.
    if (meta?.requiresDomain) {
      throw new CheckoutError("This service requires domain configuration before payment and is not yet available for instant checkout.");
    }

    floors.push({
      index,
      sku: product.sku,
      minimumTotalCents: readiness.minimumRetailCents * item.quantity,
    });
  }
  return floors;
}

/** Promotions/coupons are allowed only while every catalog line stays above
 * its verified cost/margin floor. Domain pricing has its own equivalent guard.
 */
export function assertCatalogPriceFloors(priced: PricedCart, floors: CatalogFloor[]) {
  for (const floor of floors) {
    const item = priced.items[floor.index];
    if (!item || item.kind !== "PRODUCT" || item.productSku !== floor.sku) {
      throw new CheckoutError("Catalog quote integrity check failed. Please refresh your cart.");
    }
    if (item.totalCents < floor.minimumTotalCents) {
      throw new CheckoutError("A discount would reduce this product below its protected minimum price. Remove the promotion and try again.");
    }
  }
}
