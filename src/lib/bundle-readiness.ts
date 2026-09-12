import type { Bundle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProductCommerceMeta, getProductReadiness } from "@/lib/product-readiness";

export interface BundleReadiness {
  purchasable: boolean;
  pricingReady: boolean;
  productsReady: boolean;
  billingReady: boolean;
  minimumBundlePriceCents: number | null;
  reasons: string[];
  products: Array<{ id: string; sku: string; name: string; retailPriceCents: number; minimumRetailCents: number | null }>;
}

export async function getBundleReadiness(bundle: Bundle): Promise<BundleReadiness> {
  const reasons: string[] = [];
  const uniqueSkus = [...new Set(bundle.productSkus.map((sku) => sku.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSkus.length < 2) reasons.push("A bundle must contain at least two distinct products.");
  if (uniqueSkus.length !== bundle.productSkus.length) reasons.push("Bundle product SKUs must be unique.");

  const products = uniqueSkus.length
    ? await prisma.product.findMany({ where: { sku: { in: uniqueSkus } } })
    : [];
  const bySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
  const missing = uniqueSkus.filter((sku) => !bySku.has(sku));
  if (missing.length) reasons.push(`Bundle products are missing: ${missing.join(", ")}.`);

  let productsReady = missing.length === 0 && products.length === uniqueSkus.length && products.length >= 2;
  let billingReady = true;
  let minimumBundlePriceCents = 0;
  const productStates: BundleReadiness["products"] = [];

  for (const sku of uniqueSkus) {
    const product = bySku.get(sku);
    if (!product) continue;
    const meta = await getProductCommerceMeta(product.id);
    const readiness = await getProductReadiness(product, meta);
    productStates.push({
      id: product.id,
      sku: product.sku,
      name: product.name,
      retailPriceCents: product.retailPriceCents,
      minimumRetailCents: readiness.minimumRetailCents,
    });
    if (!readiness.purchasable) {
      productsReady = false;
      reasons.push(`${product.name}: ${readiness.reasons[0] || "product is not ready"}`);
    }
    if (readiness.minimumRetailCents == null) {
      minimumBundlePriceCents = -1;
    } else if (minimumBundlePriceCents >= 0) {
      minimumBundlePriceCents += readiness.minimumRetailCents;
    }
    if (product.billingCycle !== "ONE_TIME" || product.renewalPriceCents != null) billingReady = false;
    if (product.currency.toUpperCase() !== "USD") {
      productsReady = false;
      reasons.push(`${product.name}: bundle currency conversion is not configured.`);
    }
  }

  // Phase 14 owns subscriptions, renewals and failed recurring-payment recovery.
  // Until that lifecycle is active, bundles are deliberately one-time only.
  if (!billingReady || bundle.renewalPriceCents != null) {
    billingReady = false;
    reasons.push("Recurring bundle billing is not available until the Phase 14 renewal lifecycle is active.");
  }

  const knownFloor = minimumBundlePriceCents >= 0 ? minimumBundlePriceCents : null;
  const pricingReady = knownFloor != null && bundle.bundlePriceCents >= knownFloor;
  if (knownFloor == null) reasons.push("Bundle price cannot be verified because a component cost floor is missing.");
  else if (!pricingReady) reasons.push(`Bundle price is below the protected minimum of ${(knownFloor / 100).toFixed(2)} USD.`);

  const purchasable = bundle.isActive && productsReady && pricingReady && billingReady;
  return {
    purchasable,
    pricingReady,
    productsReady,
    billingReady,
    minimumBundlePriceCents: knownFloor,
    reasons: [...new Set(reasons)],
    products: productStates,
  };
}

export async function assertBundleCanActivate(bundle: Bundle) {
  const readiness = await getBundleReadiness({ ...bundle, isActive: true });
  if (!readiness.purchasable) {
    const error = new Error(readiness.reasons[0] || "Bundle is not ready for activation.") as Error & { reasons?: string[] };
    error.reasons = readiness.reasons;
    throw error;
  }
  return readiness;
}
