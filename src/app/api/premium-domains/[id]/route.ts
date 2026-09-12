import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT pd."id", pd."domainName", pd."purchasePriceCents" AS "retailPriceCents",
             pd."renewalPriceCents", pd."currency", pd."category", pd."isFeatured",
             pim."source", pim."fulfillment_mode" AS "fulfillmentMode"
      FROM "PremiumDomain" pd
      JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=pd."id"
      WHERE pd."id"=${id}
        AND pd."status"='LISTED'
        AND pim."ownership_verified_at" IS NOT NULL
        AND pim."auto_buy_enabled"=TRUE
        AND pim."sold_at" IS NULL
        AND (pim."reserved_until" IS NULL OR pim."reserved_until" < CURRENT_TIMESTAMP)
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return jsonError("Premium domain not found or no longer available.", 404);
    return jsonOk({
      listing: {
        id: String(row.id),
        domainName: String(row.domainName),
        retailPriceCents: Number(row.retailPriceCents),
        renewalPriceCents: Number(row.renewalPriceCents),
        currency: String(row.currency),
        category: row.category ? String(row.category) : null,
        isFeatured: Boolean(row.isFeatured),
        source: String(row.source),
        fulfillmentMode: String(row.fulfillmentMode),
        offerEnabled: String(row.source) !== "REGISTRY_PREMIUM",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
