import { prisma } from "@/lib/prisma";

export async function listPremiumInventoryForAdmin() {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT pd."id", pd."domainName", pd."purchasePriceCents" AS "retailPriceCents",
           pd."renewalPriceCents", pd."currency", pd."category", pd."isFeatured", pd."status",
           pim."source", pim."domain_id" AS "domainId", pim."seller_user_id" AS "sellerUserId",
           pim."acquisition_cost_cents" AS "acquisitionCostCents", pim."fulfillment_mode" AS "fulfillmentMode",
           pim."auto_buy_enabled" AS "autoBuyEnabled", pim."ownership_verified_at" AS "ownershipVerifiedAt",
           pim."commission_bps" AS "commissionBps", pim."reserved_by_user_id" AS "reservedByUserId",
           pim."reserved_until" AS "reservedUntil", pim."sold_to_user_id" AS "soldToUserId", pim."sold_at" AS "soldAt",
           seller."email" AS "sellerEmail", owner."email" AS "managedOwnerEmail"
    FROM "PremiumDomain" pd
    LEFT JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=pd."id"
    LEFT JOIN "User" seller ON seller."id"=pim."seller_user_id"
    LEFT JOIN "Domain" d ON d."id"=pim."domain_id"
    LEFT JOIN "User" owner ON owner."id"=d."userId"
    ORDER BY CASE pd."status" WHEN 'RESERVED' THEN 0 WHEN 'LISTED' THEN 1 WHEN 'DELISTED' THEN 2 WHEN 'SOLD' THEN 3 ELSE 4 END,
             pd."isFeatured" DESC, pd."updatedAt" DESC
  `;
}

export async function listPremiumFulfillmentQueue() {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT oi."id" AS "orderItemId", oi."description", oi."totalCents", oi."provisioningStatus",
           o."id" AS "orderId", o."orderNumber", o."currency", o."createdAt" AS "orderCreatedAt",
           pd."id" AS "premiumDomainId", pd."domainName",
           pim."source", pim."domain_id" AS "domainId", pim."seller_user_id" AS "sellerUserId",
           buyer."id" AS "buyerUserId", buyer."email" AS "buyerEmail", buyer."firstName" AS "buyerFirstName", buyer."lastName" AS "buyerLastName",
           seller."email" AS "sellerEmail"
    FROM "premium_order_links" pol
    JOIN "OrderItem" oi ON oi."id"=pol."order_item_id"
    JOIN "Order" o ON o."id"=oi."orderId"
    JOIN "PremiumDomain" pd ON pd."id"=pol."premium_domain_id"
    JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=pd."id"
    JOIN "User" buyer ON buyer."id"=o."userId"
    LEFT JOIN "User" seller ON seller."id"=pim."seller_user_id"
    WHERE oi."provisioningStatus"='MANUAL_REVIEW'
      AND o."status"='PROVISIONING'
    ORDER BY o."createdAt" ASC
  `;
}

export async function listPremiumSales() {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ps.*, pd."domainName", o."orderNumber", buyer."email" AS "buyerEmail", seller."email" AS "sellerEmail",
           settled_by."email" AS "settledByEmail"
    FROM "premium_sales" ps
    JOIN "PremiumDomain" pd ON pd."id"=ps."premium_domain_id"
    JOIN "OrderItem" oi ON oi."id"=ps."order_item_id"
    JOIN "Order" o ON o."id"=oi."orderId"
    JOIN "User" buyer ON buyer."id"=ps."buyer_user_id"
    LEFT JOIN "User" seller ON seller."id"=ps."seller_user_id"
    LEFT JOIN "User" settled_by ON settled_by."id"=ps."settled_by_user_id"
    ORDER BY ps."created_at" DESC
    LIMIT 500
  `;
}

export async function updatePremiumSaleSettlement(params: {
  saleId: string;
  adminUserId: string;
  status: "PENDING" | "HELD" | "PAID";
  reference?: string | null;
}) {
  const rows = await prisma.$queryRaw<Array<{ seller_user_id: string | null; seller_proceeds_cents: number; settlement_status: string }>>`
    SELECT "seller_user_id","seller_proceeds_cents","settlement_status" FROM "premium_sales" WHERE "id"=${params.saleId} LIMIT 1
  `;
  const sale = rows[0];
  if (!sale) throw new Error("Premium sale not found.");
  if (!sale.seller_user_id || Number(sale.seller_proceeds_cents) <= 0) throw new Error("This sale has no third-party seller payout.");
  if (sale.settlement_status === "PAID" && params.status !== "PAID") throw new Error("A completed seller payout cannot be moved back to an unpaid state.");
  if (params.status === "PAID" && !params.reference?.trim()) throw new Error("A payout reference is required when marking seller proceeds as paid.");

  await prisma.$executeRaw`
    UPDATE "premium_sales"
    SET "settlement_status"=${params.status},
        "settlement_reference"=${params.reference?.trim() || null},
        "settled_at"=CASE WHEN ${params.status}='PAID' THEN CURRENT_TIMESTAMP ELSE NULL END,
        "settled_by_user_id"=CASE WHEN ${params.status}='PAID' THEN ${params.adminUserId} ELSE NULL END
    WHERE "id"=${params.saleId}
  `;
}

export async function premiumMarketplaceMetrics() {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      (SELECT COUNT(*) FROM "PremiumDomain" WHERE "status"='LISTED')::int AS "listed",
      (SELECT COUNT(*) FROM "PremiumDomain" WHERE "status"='RESERVED')::int AS "reserved",
      (SELECT COUNT(*) FROM "PremiumDomain" WHERE "status"='SOLD')::int AS "sold",
      (SELECT COUNT(*) FROM "premium_inventory_meta" WHERE "ownership_verified_at" IS NULL)::int AS "unverified",
      (SELECT COUNT(*) FROM "premium_offers" WHERE "status" IN ('PENDING','COUNTERED'))::int AS "activeOffers",
      (SELECT COUNT(*) FROM "OrderItem" WHERE "provisioningStatus"='MANUAL_REVIEW')::int AS "fulfillmentQueue",
      (SELECT COALESCE(SUM("platform_revenue_cents"),0) FROM "premium_sales")::bigint AS "platformRevenueCents",
      (SELECT COALESCE(SUM("seller_proceeds_cents"),0) FROM "premium_sales" WHERE "settlement_status" IN ('PENDING','HELD'))::bigint AS "sellerPayableCents"
  `;
  const row = rows[0] ?? {};
  return {
    listed: Number(row.listed ?? 0),
    reserved: Number(row.reserved ?? 0),
    sold: Number(row.sold ?? 0),
    unverified: Number(row.unverified ?? 0),
    activeOffers: Number(row.activeOffers ?? 0),
    fulfillmentQueue: Number(row.fulfillmentQueue ?? 0),
    platformRevenueCents: Number(row.platformRevenueCents ?? 0),
    sellerPayableCents: Number(row.sellerPayableCents ?? 0),
  };
}
