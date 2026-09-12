import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProductCommerceMeta, getProductReadiness, type ProductCommerceMeta } from "@/lib/product-readiness";

export interface ProductCommerceMetaInput {
  wholesaleCostCents?: number | null;
  wholesaleCurrency?: string;
  costSource?: ProductCommerceMeta["costSource"];
  providerConfig?: Record<string, unknown>;
  requiresDomain?: boolean;
  configurationSchema?: Record<string, unknown>;
  provisioningContract?: string | null;
  renewalContract?: string | null;
}

export async function upsertProductCommerceMeta(productId: string, input: ProductCommerceMetaInput) {
  const current = await getProductCommerceMeta(productId);
  const wholesaleCostCents = input.wholesaleCostCents !== undefined ? input.wholesaleCostCents : current?.wholesaleCostCents ?? null;
  const wholesaleCurrency = (input.wholesaleCurrency ?? current?.wholesaleCurrency ?? "USD").toUpperCase();
  const costSource = input.costSource ?? current?.costSource ?? "UNKNOWN";
  const providerConfig = input.providerConfig ?? current?.providerConfig ?? {};
  const requiresDomain = input.requiresDomain ?? current?.requiresDomain ?? false;
  const configurationSchema = input.configurationSchema ?? current?.configurationSchema ?? {};
  const provisioningContract = input.provisioningContract !== undefined ? input.provisioningContract : current?.provisioningContract ?? null;
  const renewalContract = input.renewalContract !== undefined ? input.renewalContract : current?.renewalContract ?? null;
  const costVerifiedAt = costSource === "UNKNOWN" || wholesaleCostCents == null ? null : new Date();

  await prisma.$executeRaw`
    INSERT INTO "product_commerce_meta"
      ("product_id","wholesale_cost_cents","wholesale_currency","cost_source","cost_verified_at","provider_config","requires_domain","configuration_schema","provisioning_contract","renewal_contract","updated_at")
    VALUES
      (${productId},${wholesaleCostCents},${wholesaleCurrency},${costSource},${costVerifiedAt},${JSON.stringify(providerConfig)}::jsonb,${requiresDomain},${JSON.stringify(configurationSchema)}::jsonb,${provisioningContract},${renewalContract},CURRENT_TIMESTAMP)
    ON CONFLICT ("product_id") DO UPDATE SET
      "wholesale_cost_cents"=EXCLUDED."wholesale_cost_cents",
      "wholesale_currency"=EXCLUDED."wholesale_currency",
      "cost_source"=EXCLUDED."cost_source",
      "cost_verified_at"=EXCLUDED."cost_verified_at",
      "provider_config"=EXCLUDED."provider_config",
      "requires_domain"=EXCLUDED."requires_domain",
      "configuration_schema"=EXCLUDED."configuration_schema",
      "provisioning_contract"=EXCLUDED."provisioning_contract",
      "renewal_contract"=EXCLUDED."renewal_contract",
      "updated_at"=CURRENT_TIMESTAMP
  `;
  return getProductCommerceMeta(productId);
}

export async function getProductAdminState(product: Product) {
  const meta = await getProductCommerceMeta(product.id);
  const readiness = await getProductReadiness(product, meta);
  const activationReadiness = await getProductReadiness({ ...product, status: "ACTIVE" }, meta);
  return { product, commerce: meta, readiness, activationReadiness };
}

export async function assertProductCanActivate(product: Product) {
  const meta = await getProductCommerceMeta(product.id);
  const readiness = await getProductReadiness({ ...product, status: "ACTIVE" }, meta);
  if (!readiness.purchasable) {
    const error = new Error(readiness.reasons[0] || "Product is not ready for activation.") as Error & { reasons?: string[] };
    error.reasons = readiness.reasons;
    throw error;
  }
  return readiness;
}
