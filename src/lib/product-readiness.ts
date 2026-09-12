import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { getHostingOperationalState } from "@/lib/hosting-readiness";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";

export type ProductProvisioningContract = "HOSTING_ACCOUNT" | "EMAIL_MAILBOX";

export interface ProductCommerceMeta {
  productId: string;
  wholesaleCostCents: number | null;
  wholesaleCurrency: string;
  costSource: "UNKNOWN" | "MANUAL_VERIFIED" | "PROVIDER_SYNC" | "INTERNAL_VERIFIED";
  costVerifiedAt: Date | null;
  providerConfig: Record<string, unknown>;
  requiresDomain: boolean;
  configurationSchema: Record<string, unknown>;
  provisioningContract: string | null;
  renewalContract: string | null;
}

export interface ProductReadiness {
  purchasable: boolean;
  providerReady: boolean;
  fulfillmentReady: boolean;
  pricingReady: boolean;
  billingReady: boolean;
  minimumRetailCents: number | null;
  reasons: string[];
}

export async function getProductCommerceMeta(productId: string): Promise<ProductCommerceMeta | null> {
  const rows = await prisma.$queryRaw<Array<{
    product_id: string; wholesale_cost_cents: number | null; wholesale_currency: string; cost_source: ProductCommerceMeta["costSource"];
    cost_verified_at: Date | null; provider_config: unknown; requires_domain: boolean; configuration_schema: unknown;
    provisioning_contract: string | null; renewal_contract: string | null;
  }>>`SELECT * FROM "product_commerce_meta" WHERE "product_id"=${productId} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    productId: row.product_id,
    wholesaleCostCents: row.wholesale_cost_cents,
    wholesaleCurrency: row.wholesale_currency,
    costSource: row.cost_source,
    costVerifiedAt: row.cost_verified_at,
    providerConfig: asObject(row.provider_config),
    requiresDomain: row.requires_domain,
    configurationSchema: asObject(row.configuration_schema),
    provisioningContract: row.provisioning_contract,
    renewalContract: row.renewal_contract,
  };
}

export async function getProductReadiness(product: Product, suppliedMeta?: ProductCommerceMeta | null): Promise<ProductReadiness> {
  const meta = suppliedMeta === undefined ? await getProductCommerceMeta(product.id) : suppliedMeta;
  const reasons: string[] = [];
  let providerReady = false;
  let fulfillmentReady = false;
  let pricingReady = false;
  let billingReady = false;
  let minimumRetailCents: number | null = null;

  if (!meta) {
    reasons.push("Commerce metadata has not been verified for this product.");
  } else {
    if (meta.wholesaleCostCents == null || meta.costSource === "UNKNOWN" || !meta.costVerifiedAt) {
      reasons.push("Verified wholesale cost is missing.");
    } else if (meta.wholesaleCurrency.toUpperCase() !== product.currency.toUpperCase()) {
      reasons.push(`Wholesale currency ${meta.wholesaleCurrency} does not match retail currency ${product.currency}.`);
    } else {
      const policy = await getPricingSafetyPolicy();
      minimumRetailCents = computeSafeRetailPrice(meta.wholesaleCostCents, policy).retailCents;
      pricingReady = product.setupFeeCents === 0 && product.retailPriceCents >= minimumRetailCents;
      if (product.setupFeeCents > 0) reasons.push("Setup-fee collection is not active for catalog checkout yet.");
      else if (!pricingReady) reasons.push(`Retail price is below the protected minimum of ${(minimumRetailCents / 100).toFixed(2)} ${product.currency}.`);
    }

    const contract = meta.provisioningContract as ProductProvisioningContract | null;
    if (contract === "HOSTING_ACCOUNT") {
      const hosting = await getHostingOperationalState();
      const planCode = product.providerProductId?.trim() || "";
      const planVerified = Boolean(planCode) && hosting.creatablePlanCodes.includes(planCode);
      providerReady = hosting.configured && hosting.verified;
      fulfillmentReady = product.category === "HOSTING"
        && ["hosting", "cpanel_whm"].includes(product.providerName || "")
        && planVerified
        && meta.requiresDomain;
      if (!hosting.configured) reasons.push("cPanel/WHM hosting credentials are not configured.");
      else if (!hosting.verified) reasons.push(hosting.reason || "cPanel/WHM must pass a live provider test before this plan can be sold.");
      if (!planCode) reasons.push("WHM hosting plan code is missing.");
      else if (hosting.verified && !planVerified) reasons.push("The configured WHM plan code is not in the live-tested list of packages this reseller can create.");
      if (!meta.requiresDomain) reasons.push("Hosting products must require a managed domain.");
      if (product.providerName && !["hosting", "cpanel_whm"].includes(product.providerName)) reasons.push("Hosting product provider name does not match the WHM integration.");
    } else if (contract === "EMAIL_MAILBOX") {
      const email = await getEmailOperationalState();
      const storageMb = Number(meta.providerConfig.storageMb);
      providerReady = email.configured && email.verified;
      fulfillmentReady = product.category === "EMAIL"
        && ["email", "email_hosting", "opensrs_hosted_email"].includes(product.providerName || "")
        && meta.requiresDomain
        && Number.isInteger(storageMb)
        && storageMb > 0;
      if (!email.configured) reasons.push("OpenSRS Hosted Email credentials are not configured.");
      else if (!email.verified) reasons.push(email.reason || "OpenSRS Hosted Email must pass a live provider test before mailboxes can be sold.");
      if (!meta.requiresDomain) reasons.push("Mailbox products must require a managed domain.");
      if (!Number.isInteger(storageMb) || storageMb <= 0) reasons.push("Mailbox storage configuration is missing.");
      if (product.providerName && !["email", "email_hosting", "opensrs_hosted_email"].includes(product.providerName)) reasons.push("Business email product provider name does not match the OpenSRS integration.");
    } else {
      providerReady = false;
      fulfillmentReady = false;
      if (meta.provisioningContract) reasons.push(`Provisioning contract ${meta.provisioningContract} is not implemented.`);
      else reasons.push("A supported provisioning contract is missing.");
    }
  }

  const isRecurringHosting = product.category === "HOSTING"
    && meta?.provisioningContract === "HOSTING_ACCOUNT"
    && meta.renewalContract === "HOSTING_RENEWAL"
    && ["MONTHLY", "YEARLY"].includes(product.billingCycle);
  const isRecurringEmail = product.category === "EMAIL"
    && meta?.provisioningContract === "EMAIL_MAILBOX"
    && meta.renewalContract === "EMAIL_RENEWAL"
    && ["MONTHLY", "YEARLY"].includes(product.billingCycle);

  if (isRecurringHosting || isRecurringEmail) {
    const renewalPrice = product.renewalPriceCents;
    billingReady = product.setupFeeCents === 0
      && Number.isSafeInteger(renewalPrice)
      && Number(renewalPrice) > 0
      && minimumRetailCents !== null
      && Number(renewalPrice) >= minimumRetailCents;
    if (!Number.isSafeInteger(renewalPrice) || Number(renewalPrice) <= 0) reasons.push(`${isRecurringEmail ? "Recurring email" : "Recurring hosting"} requires a positive renewal price.`);
    else if (minimumRetailCents !== null && Number(renewalPrice) < minimumRetailCents) reasons.push(`${isRecurringEmail ? "Email" : "Hosting"} renewal price is below the protected minimum of ${(minimumRetailCents / 100).toFixed(2)} ${product.currency}.`);
  } else {
    billingReady = product.billingCycle === "ONE_TIME" && product.renewalPriceCents == null && product.setupFeeCents === 0;
    if (product.billingCycle !== "ONE_TIME") reasons.push("Recurring billing is not enabled for this product contract.");
    if (product.billingCycle === "ONE_TIME" && product.renewalPriceCents != null) reasons.push("A one-time product cannot advertise a renewal price without a service-renewal contract.");
  }

  if (product.category === "AI" && getAIProvider().isConfigured() && !meta?.provisioningContract) {
    if (!reasons.includes("A supported provisioning contract is missing.")) reasons.push("AI generation is configured, but no paid catalog entitlement contract exists yet.");
  }

  const purchasable = product.status === "ACTIVE" && Boolean(meta) && providerReady && fulfillmentReady && pricingReady && billingReady;
  return { purchasable, providerReady, fulfillmentReady, pricingReady, billingReady, minimumRetailCents, reasons: unique(reasons) };
}

export async function assertProductPurchasable(product: Product) {
  const readiness = await getProductReadiness(product);
  if (!readiness.purchasable) throw new Error(readiness.reasons[0] || "This product is not currently purchasable.");
  return readiness;
}

export async function validateProductConfiguration(params: { product: Product; userId: string; domainId?: string; configuration?: Record<string, string> }) {
  const meta = await getProductCommerceMeta(params.product.id);
  if (!meta) throw new Error("Product commerce configuration is missing.");
  let domain: { id: string; name: string } | null = null;
  if (meta.requiresDomain) {
    if (!params.domainId) throw new Error("Select a domain in your account for this product.");
    domain = await prisma.domain.findFirst({ where: { id: params.domainId, userId: params.userId, status: { in: ["ACTIVE", "EXPIRING"] } }, select: { id: true, name: true } });
    if (!domain) throw new Error("The selected domain is not an active domain in your account.");
  }
  const config = { ...(params.configuration ?? {}) };
  if (meta.provisioningContract === "EMAIL_MAILBOX") {
    const localPart = (config.localPart || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(localPart)) throw new Error("Enter a valid mailbox name.");
    config.localPart = localPart;
  }
  return { meta, domain, configuration: config };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function unique(values: string[]) { return [...new Set(values)]; }
