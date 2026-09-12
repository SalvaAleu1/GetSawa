import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";

const schema = z.object({
  retailPriceCents: z.number().int().positive().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  isFeatured: z.boolean().optional(),
  autoBuyEnabled: z.boolean().optional(),
  acquisitionCostCents: z.number().int().min(0).nullable().optional(),
  commissionBps: z.number().int().min(0).max(10000).optional(),
  status: z.enum(["LISTED", "DELISTED"]).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const { id } = await params;
    const input = schema.parse(await req.json());
    const listing = await prisma.premiumDomain.findUnique({ where: { id } });
    if (!listing) return jsonError("Premium inventory record not found.", 404);
    if (["SOLD", "RESERVED"].includes(listing.status)) return jsonError("A reserved or sold premium domain cannot be edited as available inventory.", 409);

    const metadata = await prisma.$queryRaw<Array<{
      source: string;
      acquisition_cost_cents: number | null;
      ownership_verified_at: Date | null;
      sold_at: Date | null;
    }>>`
      SELECT "source","acquisition_cost_cents","ownership_verified_at","sold_at"
      FROM "premium_inventory_meta" WHERE "premium_domain_id"=${id} LIMIT 1
    `;
    const meta = metadata[0];
    if (!meta) return jsonError("Premium inventory custody metadata is missing.", 409);
    if (meta.sold_at) return jsonError("This premium domain has already been sold.", 409);
    if (input.status === "LISTED" && !meta.ownership_verified_at) return jsonError("Registrar custody must be verified before this domain can be listed.", 409);

    const nextAcquisition = input.acquisitionCostCents !== undefined ? input.acquisitionCostCents : meta.acquisition_cost_cents;
    const nextRetail = input.retailPriceCents ?? listing.purchasePriceCents;
    if (meta.source === "GETSAWA_INVENTORY") {
      if (nextAcquisition == null) return jsonError("GetSawa-owned inventory requires an acquisition cost for margin protection.", 400);
      const protectedFloor = computeSafeRetailPrice(nextAcquisition, await getPricingSafetyPolicy()).retailCents;
      if (nextRetail < protectedFloor) return jsonError(`The retail price is below the protected minimum of ${(protectedFloor / 100).toFixed(2)} USD.`, 400);
    }
    if (meta.source === "CUSTOMER_CUSTODY" && input.commissionBps === 0) return jsonError("Customer-owned inventory requires a marketplace commission greater than zero.", 400);

    const updated = await prisma.$transaction(async (tx) => {
      const premium = await tx.premiumDomain.update({
        where: { id },
        data: {
          purchasePriceCents: input.retailPriceCents,
          category: input.category === undefined ? undefined : input.category,
          isFeatured: input.isFeatured,
          status: input.status,
        },
      });
      if (input.autoBuyEnabled !== undefined || input.acquisitionCostCents !== undefined || input.commissionBps !== undefined) {
        await tx.$executeRaw`
          UPDATE "premium_inventory_meta"
          SET "auto_buy_enabled"=COALESCE(${input.autoBuyEnabled ?? null},"auto_buy_enabled"),
              "acquisition_cost_cents"=CASE WHEN ${input.acquisitionCostCents === undefined} THEN "acquisition_cost_cents" ELSE ${input.acquisitionCostCents ?? null} END,
              "commission_bps"=COALESCE(${input.commissionBps ?? null},"commission_bps"),
              "updated_at"=CURRENT_TIMESTAMP
          WHERE "premium_domain_id"=${id}
        `;
      }
      return premium;
    });

    await logAudit({ actorId: admin.id, action: "premium_inventory.updated", resource: "premium_domain", resourceId: id, metadata: { fields: Object.keys(input) } });
    return jsonOk({ listing: updated });
  } catch (err) {
    return handleError(err);
  }
}
