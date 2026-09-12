import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";

export type PremiumInventorySource = "UNVERIFIED" | "GETSAWA_INVENTORY" | "CUSTOMER_CUSTODY" | "REGISTRY_PREMIUM";
export type PremiumFulfillmentMode = "MANUAL_REVIEW" | "INTERNAL_ASSIGNMENT" | "REGISTRY_REGISTRATION";
export type PremiumOfferStatus = "PENDING" | "COUNTERED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "EXPIRED" | "PURCHASED";

export interface PremiumInventoryMeta {
  premiumDomainId: string;
  source: PremiumInventorySource;
  domainId: string | null;
  sellerUserId: string | null;
  acquisitionCostCents: number | null;
  fulfillmentMode: PremiumFulfillmentMode;
  autoBuyEnabled: boolean;
  ownershipVerifiedAt: Date | null;
  verifiedByUserId: string | null;
  commissionBps: number;
  reservedByUserId: string | null;
  reservedUntil: Date | null;
  soldToUserId: string | null;
  soldAt: Date | null;
}

export interface PublicPremiumListing {
  id: string;
  domainName: string;
  retailPriceCents: number;
  renewalPriceCents: number;
  currency: string;
  category: string | null;
  isFeatured: boolean;
  source: PremiumInventorySource;
  fulfillmentMode: PremiumFulfillmentMode;
  offerEnabled: boolean;
}

export interface PremiumOfferRow {
  id: string;
  premiumDomainId: string;
  buyerUserId: string;
  amountCents: number;
  currency: string;
  status: PremiumOfferStatus;
  counterAmountCents: number | null;
  acceptedPriceCents: number | null;
  expiresAt: Date | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PremiumPolicy {
  minOfferPercent: number;
  offerTtlHours: number;
  acceptedOfferTtlHours: number;
  reservationMinutes: number;
}

const DEFAULT_POLICY: PremiumPolicy = {
  minOfferPercent: 50,
  offerTtlHours: 72,
  acceptedOfferTtlHours: 48,
  reservationMinutes: 12,
};

function mapMeta(row: Record<string, unknown>): PremiumInventoryMeta {
  return {
    premiumDomainId: String(row.premium_domain_id),
    source: String(row.source) as PremiumInventorySource,
    domainId: row.domain_id ? String(row.domain_id) : null,
    sellerUserId: row.seller_user_id ? String(row.seller_user_id) : null,
    acquisitionCostCents: row.acquisition_cost_cents == null ? null : Number(row.acquisition_cost_cents),
    fulfillmentMode: String(row.fulfillment_mode) as PremiumFulfillmentMode,
    autoBuyEnabled: Boolean(row.auto_buy_enabled),
    ownershipVerifiedAt: row.ownership_verified_at ? new Date(String(row.ownership_verified_at)) : null,
    verifiedByUserId: row.verified_by_user_id ? String(row.verified_by_user_id) : null,
    commissionBps: Number(row.commission_bps ?? 0),
    reservedByUserId: row.reserved_by_user_id ? String(row.reserved_by_user_id) : null,
    reservedUntil: row.reserved_until ? new Date(String(row.reserved_until)) : null,
    soldToUserId: row.sold_to_user_id ? String(row.sold_to_user_id) : null,
    soldAt: row.sold_at ? new Date(String(row.sold_at)) : null,
  };
}

function mapOffer(row: Record<string, unknown>): PremiumOfferRow {
  return {
    id: String(row.id),
    premiumDomainId: String(row.premium_domain_id),
    buyerUserId: String(row.buyer_user_id),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    status: String(row.status) as PremiumOfferStatus,
    counterAmountCents: row.counter_amount_cents == null ? null : Number(row.counter_amount_cents),
    acceptedPriceCents: row.accepted_price_cents == null ? null : Number(row.accepted_price_cents),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)) : null,
    decidedByUserId: row.decided_by_user_id ? String(row.decided_by_user_id) : null,
    decidedAt: row.decided_at ? new Date(String(row.decided_at)) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export async function getPremiumPolicy(): Promise<PremiumPolicy> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "premium_marketplace_policy" } });
  const raw = setting?.value && typeof setting.value === "object" ? setting.value as Record<string, unknown> : {};
  return {
    minOfferPercent: clampNumber(raw.minOfferPercent, 1, 100, DEFAULT_POLICY.minOfferPercent),
    offerTtlHours: clampNumber(raw.offerTtlHours, 1, 720, DEFAULT_POLICY.offerTtlHours),
    acceptedOfferTtlHours: clampNumber(raw.acceptedOfferTtlHours, 1, 168, DEFAULT_POLICY.acceptedOfferTtlHours),
    reservationMinutes: clampNumber(raw.reservationMinutes, 5, 30, DEFAULT_POLICY.reservationMinutes),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export async function listPublicPremiumDomains(params: {
  q?: string;
  category?: string;
  source?: PremiumInventorySource;
  featured?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  limit?: number;
} = {}): Promise<PublicPremiumListing[]> {
  const q = params.q?.trim().toLowerCase() || null;
  const category = params.category?.trim() || null;
  const source = params.source || null;
  const featured = params.featured ?? null;
  const min = params.minPriceCents ?? null;
  const max = params.maxPriceCents ?? null;
  const limit = Math.min(100, Math.max(1, params.limit ?? 60));

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT pd."id", pd."domainName", pd."purchasePriceCents", pd."renewalPriceCents", pd."currency",
           pd."category", pd."isFeatured", pim."source", pim."fulfillment_mode"
    FROM "PremiumDomain" pd
    JOIN "premium_inventory_meta" pim ON pim."premium_domain_id" = pd."id"
    WHERE pd."status" = 'LISTED'
      AND pim."ownership_verified_at" IS NOT NULL
      AND pim."sold_at" IS NULL
      AND pim."auto_buy_enabled" = TRUE
      AND (pim."reserved_until" IS NULL OR pim."reserved_until" < CURRENT_TIMESTAMP)
      AND (${q}::text IS NULL OR LOWER(pd."domainName") LIKE '%' || ${q} || '%')
      AND (${category}::text IS NULL OR pd."category" = ${category})
      AND (${source}::text IS NULL OR pim."source" = ${source})
      AND (${featured}::boolean IS NULL OR pd."isFeatured" = ${featured})
      AND (${min}::integer IS NULL OR pd."purchasePriceCents" >= ${min})
      AND (${max}::integer IS NULL OR pd."purchasePriceCents" <= ${max})
    ORDER BY pd."isFeatured" DESC, pd."purchasePriceCents" ASC, pd."domainName" ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    domainName: String(row.domainName),
    retailPriceCents: Number(row.purchasePriceCents),
    renewalPriceCents: Number(row.renewalPriceCents),
    currency: String(row.currency),
    category: row.category ? String(row.category) : null,
    isFeatured: Boolean(row.isFeatured),
    source: String(row.source) as PremiumInventorySource,
    fulfillmentMode: String(row.fulfillment_mode) as PremiumFulfillmentMode,
    offerEnabled: String(row.source) !== "REGISTRY_PREMIUM",
  }));
}

export async function getPremiumInventoryMeta(premiumDomainId: string): Promise<PremiumInventoryMeta | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "premium_inventory_meta" WHERE "premium_domain_id" = ${premiumDomainId} LIMIT 1
  `;
  return rows[0] ? mapMeta(rows[0]) : null;
}

export async function getPremiumListingForCheckout(premiumDomainId: string, buyerUserId: string, premiumOfferId?: string) {
  const listing = await prisma.premiumDomain.findUnique({ where: { id: premiumDomainId }, include: { tld: true } });
  if (!listing || listing.status !== "LISTED") throw new Error("This premium domain is no longer available.");
  const meta = await getPremiumInventoryMeta(listing.id);
  if (!meta?.ownershipVerifiedAt || !meta.autoBuyEnabled || meta.soldAt) throw new Error("This premium domain is not currently available for checkout.");
  if (meta.reservedUntil && meta.reservedUntil.getTime() > Date.now() && meta.reservedByUserId !== buyerUserId) {
    throw new Error("This premium domain is currently reserved by another buyer.");
  }

  let priceCents = listing.purchasePriceCents;
  let offer: PremiumOfferRow | null = null;
  if (premiumOfferId) {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "premium_offers" WHERE "id" = ${premiumOfferId} AND "premium_domain_id" = ${listing.id} AND "buyer_user_id" = ${buyerUserId} LIMIT 1
    `;
    offer = rows[0] ? mapOffer(rows[0]) : null;
    if (!offer || offer.status !== "ACCEPTED" || offer.acceptedPriceCents == null) throw new Error("This premium offer is not approved for checkout.");
    if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) throw new Error("This premium offer has expired.");
    priceCents = offer.acceptedPriceCents;
  }

  return { listing, meta, offer, priceCents };
}

export async function verifyPremiumInventory(params: {
  premiumDomainId: string;
  adminUserId: string;
  source: Exclude<PremiumInventorySource, "UNVERIFIED" | "REGISTRY_PREMIUM">;
  acquisitionCostCents?: number | null;
  commissionBps?: number;
  autoBuyEnabled?: boolean;
}) {
  const listing = await prisma.premiumDomain.findUnique({ where: { id: params.premiumDomainId } });
  if (!listing) throw new Error("Premium listing not found.");
  const domain = await prisma.domain.findUnique({ where: { name: listing.domainName }, include: { user: true } });
  if (!domain) throw new Error("The domain must already exist in GetSawa's managed domain portfolio before it can be sold as aftermarket inventory.");
  if (!["ACTIVE", "EXPIRING"].includes(domain.status)) throw new Error("Only active managed domains can be verified for aftermarket sale.");

  const provider = getDomainProvider();
  if (!provider.isConfigured()) throw new Error("The registrar is not configured, so ownership cannot be verified.");
  const registrarInfo = await provider.getDomainInfo(listing.domainName);
  if (!registrarInfo?.domain || registrarInfo.domain.toLowerCase() !== listing.domainName.toLowerCase()) {
    throw new Error("The registrar did not confirm custody of this domain.");
  }

  const sellerUserId = params.source === "CUSTOMER_CUSTODY" ? domain.userId : null;
  const commissionBps = Math.min(10000, Math.max(0, Math.round(params.commissionBps ?? 0)));
  const acquisitionCost = params.acquisitionCostCents == null ? null : Math.max(0, Math.round(params.acquisitionCostCents));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "premium_inventory_meta"
        ("premium_domain_id","source","domain_id","seller_user_id","acquisition_cost_cents","fulfillment_mode","auto_buy_enabled","ownership_verified_at","verified_by_user_id","commission_bps","updated_at")
      VALUES
        (${listing.id},${params.source},${domain.id},${sellerUserId},${acquisitionCost},'MANUAL_REVIEW',${params.autoBuyEnabled ?? true},CURRENT_TIMESTAMP,${params.adminUserId},${commissionBps},CURRENT_TIMESTAMP)
      ON CONFLICT ("premium_domain_id") DO UPDATE SET
        "source"=EXCLUDED."source",
        "domain_id"=EXCLUDED."domain_id",
        "seller_user_id"=EXCLUDED."seller_user_id",
        "acquisition_cost_cents"=EXCLUDED."acquisition_cost_cents",
        "fulfillment_mode"='MANUAL_REVIEW',
        "auto_buy_enabled"=EXCLUDED."auto_buy_enabled",
        "ownership_verified_at"=CURRENT_TIMESTAMP,
        "verified_by_user_id"=EXCLUDED."verified_by_user_id",
        "commission_bps"=EXCLUDED."commission_bps",
        "updated_at"=CURRENT_TIMESTAMP
    `;
    await tx.premiumDomain.update({ where: { id: listing.id }, data: { status: "LISTED" } });
  });

  return { listingId: listing.id, domainId: domain.id, sellerUserId, registrarStatus: registrarInfo.status };
}

export async function reservePremiumInventory(premiumDomainId: string, buyerUserId: string) {
  const policy = await getPremiumPolicy();
  const until = new Date(Date.now() + policy.reservationMinutes * 60_000);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "premium_inventory_meta" pim
    SET "reserved_by_user_id"=${buyerUserId}, "reserved_until"=${until}, "updated_at"=CURRENT_TIMESTAMP
    FROM "PremiumDomain" pd
    WHERE pim."premium_domain_id"=${premiumDomainId}
      AND pd."id"=pim."premium_domain_id"
      AND pd."status"='LISTED'
      AND pim."ownership_verified_at" IS NOT NULL
      AND pim."auto_buy_enabled"=TRUE
      AND pim."sold_at" IS NULL
      AND (pim."reserved_until" IS NULL OR pim."reserved_until" < CURRENT_TIMESTAMP OR pim."reserved_by_user_id"=${buyerUserId})
    RETURNING pim.*
  `;
  if (!rows[0]) throw new Error("This premium domain was reserved by another buyer. Refresh the listing to see its current availability.");
  return mapMeta(rows[0]);
}

export async function releasePremiumReservation(premiumDomainId: string, buyerUserId: string) {
  await prisma.$executeRaw`
    UPDATE "premium_inventory_meta"
    SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP
    WHERE "premium_domain_id"=${premiumDomainId} AND "reserved_by_user_id"=${buyerUserId} AND "sold_at" IS NULL
  `;
}

export async function releasePremiumReservationsForOrder(orderId: string, buyerUserId: string) {
  await prisma.$executeRaw`
    UPDATE "premium_inventory_meta" pim
    SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP
    WHERE pim."premium_domain_id" IN (
      SELECT pol."premium_domain_id"
      FROM "premium_order_links" pol
      JOIN "OrderItem" oi ON oi."id"=pol."order_item_id"
      WHERE oi."orderId"=${orderId}
    )
    AND pim."reserved_by_user_id"=${buyerUserId}
    AND pim."sold_at" IS NULL
  `;
}

export async function linkPremiumOrderItem(orderItemId: string, premiumDomainId: string, premiumOfferId?: string | null) {
  await prisma.$executeRaw`
    INSERT INTO "premium_order_links" ("order_item_id","premium_domain_id","premium_offer_id")
    VALUES (${orderItemId},${premiumDomainId},${premiumOfferId ?? null})
    ON CONFLICT ("order_item_id") DO NOTHING
  `;
}

export async function getPremiumOrderLink(orderItemId: string) {
  const rows = await prisma.$queryRaw<{ premium_domain_id: string; premium_offer_id: string | null }[]>`
    SELECT "premium_domain_id","premium_offer_id" FROM "premium_order_links" WHERE "order_item_id"=${orderItemId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createPremiumOffer(params: { premiumDomainId: string; buyerUserId: string; amountCents: number }) {
  const listing = await prisma.premiumDomain.findUnique({ where: { id: params.premiumDomainId } });
  if (!listing || listing.status !== "LISTED") throw new Error("This premium domain is not accepting offers.");
  const meta = await getPremiumInventoryMeta(listing.id);
  if (!meta?.ownershipVerifiedAt || meta.soldAt) throw new Error("This premium domain is not accepting offers.");
  if (meta.sellerUserId === params.buyerUserId) throw new Error("You cannot make an offer on your own domain.");
  const policy = await getPremiumPolicy();
  const minimum = Math.max(100, Math.ceil(listing.purchasePriceCents * policy.minOfferPercent / 100));
  if (params.amountCents < minimum) throw new Error(`Offers for this domain start at ${(minimum / 100).toFixed(2)} ${listing.currency}.`);

  const existing = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "premium_offers"
    WHERE "premium_domain_id"=${listing.id} AND "buyer_user_id"=${params.buyerUserId}
      AND "status" IN ('PENDING','COUNTERED','ACCEPTED')
    ORDER BY "created_at" DESC LIMIT 1
  `;
  if (existing[0]) throw new Error("You already have an active offer for this domain.");

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + policy.offerTtlHours * 60 * 60_000);
  await prisma.$executeRaw`
    INSERT INTO "premium_offers" ("id","premium_domain_id","buyer_user_id","amount_cents","currency","status","expires_at")
    VALUES (${id},${listing.id},${params.buyerUserId},${Math.round(params.amountCents)},${listing.currency},'PENDING',${expiresAt})
  `;
  return { id, expiresAt, minimumOfferCents: minimum };
}

export async function listPremiumOffersForBuyer(buyerUserId: string) {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT po.*, pd."domainName", pd."purchasePriceCents" AS "askingPriceCents", pd."currency"
    FROM "premium_offers" po
    JOIN "PremiumDomain" pd ON pd."id"=po."premium_domain_id"
    WHERE po."buyer_user_id"=${buyerUserId}
    ORDER BY po."created_at" DESC
    LIMIT 100
  `;
}

export async function listPremiumOffersForAdmin() {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT po.*, pd."domainName", pd."purchasePriceCents" AS "askingPriceCents", u."email" AS "buyerEmail"
    FROM "premium_offers" po
    JOIN "PremiumDomain" pd ON pd."id"=po."premium_domain_id"
    JOIN "User" u ON u."id"=po."buyer_user_id"
    ORDER BY CASE po."status" WHEN 'PENDING' THEN 0 WHEN 'COUNTERED' THEN 1 WHEN 'ACCEPTED' THEN 2 ELSE 3 END, po."created_at" DESC
    LIMIT 250
  `;
}

export async function decidePremiumOffer(params: { offerId: string; adminUserId: string; action: "ACCEPT" | "REJECT" | "COUNTER"; counterAmountCents?: number }) {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "premium_offers" WHERE "id"=${params.offerId} LIMIT 1`;
  const offer = rows[0] ? mapOffer(rows[0]) : null;
  if (!offer || !["PENDING", "COUNTERED"].includes(offer.status)) throw new Error("This offer can no longer be changed.");
  const policy = await getPremiumPolicy();
  const purchaseExpiry = new Date(Date.now() + policy.acceptedOfferTtlHours * 60 * 60_000);

  if (params.action === "ACCEPT") {
    await prisma.$executeRaw`
      UPDATE "premium_offers" SET "status"='ACCEPTED', "accepted_price_cents"="amount_cents", "expires_at"=${purchaseExpiry}, "decided_by_user_id"=${params.adminUserId}, "decided_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${offer.id}
    `;
  } else if (params.action === "REJECT") {
    await prisma.$executeRaw`
      UPDATE "premium_offers" SET "status"='REJECTED', "decided_by_user_id"=${params.adminUserId}, "decided_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${offer.id}
    `;
  } else {
    const counter = Math.round(params.counterAmountCents ?? 0);
    if (counter <= 0) throw new Error("A counter-offer amount is required.");
    await prisma.$executeRaw`
      UPDATE "premium_offers" SET "status"='COUNTERED', "counter_amount_cents"=${counter}, "accepted_price_cents"=NULL, "expires_at"=${purchaseExpiry}, "decided_by_user_id"=${params.adminUserId}, "decided_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${offer.id}
    `;
  }
}

export async function actOnBuyerPremiumOffer(params: { offerId: string; buyerUserId: string; action: "ACCEPT_COUNTER" | "WITHDRAW" }) {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "premium_offers" WHERE "id"=${params.offerId} AND "buyer_user_id"=${params.buyerUserId} LIMIT 1
  `;
  const offer = rows[0] ? mapOffer(rows[0]) : null;
  if (!offer) throw new Error("Offer not found.");
  if (params.action === "WITHDRAW") {
    if (!["PENDING", "COUNTERED", "ACCEPTED"].includes(offer.status)) throw new Error("This offer can no longer be withdrawn.");
    await prisma.$executeRaw`UPDATE "premium_offers" SET "status"='WITHDRAWN', "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${offer.id}`;
    return;
  }
  if (offer.status !== "COUNTERED" || offer.counterAmountCents == null) throw new Error("There is no counter-offer to accept.");
  if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) throw new Error("The counter-offer has expired.");
  const policy = await getPremiumPolicy();
  const expiresAt = new Date(Date.now() + policy.acceptedOfferTtlHours * 60 * 60_000);
  await prisma.$executeRaw`
    UPDATE "premium_offers" SET "status"='ACCEPTED', "accepted_price_cents"="counter_amount_cents", "expires_at"=${expiresAt}, "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${offer.id}
  `;
}

export async function markPremiumItemAwaitingFulfillment(orderItemId: string, buyerUserId: string) {
  const link = await getPremiumOrderLink(orderItemId);
  if (!link) return false;
  await prisma.$transaction(async (tx) => {
    await tx.premiumDomain.update({ where: { id: link.premium_domain_id }, data: { status: "RESERVED" } });
    await tx.orderItem.update({ where: { id: orderItemId }, data: { provisioningStatus: "MANUAL_REVIEW", provisioningNote: "Payment confirmed; registrar ownership verification is required before release." } });
    await tx.$executeRaw`
      UPDATE "premium_inventory_meta" SET "reserved_by_user_id"=${buyerUserId}, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP WHERE "premium_domain_id"=${link.premium_domain_id} AND "sold_at" IS NULL
    `;
  });
  return true;
}

export async function completePremiumFulfillment(params: { orderItemId: string; adminUserId: string; registrarReference?: string }) {
  const item = await prisma.orderItem.findUnique({ where: { id: params.orderItemId }, include: { order: true } });
  if (!item) throw new Error("Order item not found.");
  if (item.provisioningStatus !== "MANUAL_REVIEW") throw new Error("This premium sale is not awaiting manual fulfillment.");
  const link = await getPremiumOrderLink(item.id);
  if (!link) throw new Error("Premium sale linkage is missing.");
  const listing = await prisma.premiumDomain.findUnique({ where: { id: link.premium_domain_id } });
  if (!listing) throw new Error("Premium listing not found.");
  const meta = await getPremiumInventoryMeta(listing.id);
  if (!meta?.domainId || !meta.ownershipVerifiedAt) throw new Error("Premium inventory custody is not verified.");
  if (meta.soldAt) return;

  const domain = await prisma.domain.findUnique({ where: { id: meta.domainId } });
  if (!domain || domain.name.toLowerCase() !== listing.domainName.toLowerCase()) throw new Error("Managed domain custody record does not match the premium listing.");
  const provider = getDomainProvider();
  const registrarInfo = await provider.getDomainInfo(domain.name);
  if (!registrarInfo?.domain) throw new Error("The registrar did not confirm the domain before fulfillment.");

  const gross = item.totalCents;
  const sellerProceeds = meta.source === "CUSTOMER_CUSTODY" ? Math.floor(gross * (10000 - meta.commissionBps) / 10000) : 0;
  const acquisition = meta.acquisitionCostCents ?? 0;
  const platformRevenue = meta.source === "CUSTOMER_CUSTODY" ? gross - sellerProceeds : gross - acquisition;
  const settlementStatus = meta.source === "CUSTOMER_CUSTODY" ? "PENDING" : "NOT_APPLICABLE";
  const saleId = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    const current = await tx.premiumDomain.findUnique({ where: { id: listing.id } });
    if (!current || current.status !== "RESERVED") throw new Error("Premium listing is no longer reserved for fulfillment.");
    await tx.domain.update({ where: { id: domain.id }, data: { userId: item.order.userId, isPremium: true } });
    await tx.premiumDomain.update({ where: { id: listing.id }, data: { status: "SOLD" } });
    await tx.orderItem.update({ where: { id: item.id }, data: { domainId: domain.id, provisioningStatus: "PROVISIONED", provisioningNote: "Registrar ownership/contact change verified and premium domain released to buyer." } });
    await tx.$executeRaw`
      UPDATE "premium_inventory_meta" SET "sold_to_user_id"=${item.order.userId}, "sold_at"=CURRENT_TIMESTAMP, "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP WHERE "premium_domain_id"=${listing.id} AND "sold_at" IS NULL
    `;
    await tx.$executeRaw`
      INSERT INTO "premium_sales" ("id","premium_domain_id","order_item_id","buyer_user_id","seller_user_id","gross_cents","acquisition_cost_cents","seller_proceeds_cents","platform_revenue_cents","currency","settlement_status","fulfilled_at")
      VALUES (${saleId},${listing.id},${item.id},${item.order.userId},${meta.sellerUserId},${gross},${meta.acquisitionCostCents},${sellerProceeds},${platformRevenue},${item.order.currency},${settlementStatus},CURRENT_TIMESTAMP)
      ON CONFLICT ("order_item_id") DO NOTHING
    `;
    if (link.premium_offer_id) {
      await tx.$executeRaw`UPDATE "premium_offers" SET "status"='PURCHASED', "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${link.premium_offer_id}`;
    }
  });

  return { listingId: listing.id, domainId: domain.id, saleId, sellerProceedsCents: sellerProceeds, settlementStatus, registrarReference: params.registrarReference ?? null };
}
