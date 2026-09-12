import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { decidePremiumOffer } from "@/lib/premium-aftermarket";
import { validatePremiumMarketplaceEconomics } from "@/lib/premium-economics";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACCEPT") }),
  z.object({ action: z.literal("REJECT") }),
  z.object({ action: z.literal("COUNTER"), counterAmountCents: z.number().int().positive() }),
]);
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const { id } = await params;
    const input = schema.parse(await req.json());
    const current = await prisma.$queryRaw<Array<{
      premium_domain_id: string;
      buyer_user_id: string;
      amount_cents: number;
      source: string;
      acquisition_cost_cents: number | null;
      commission_bps: number;
    }>>`
      SELECT po."premium_domain_id", po."buyer_user_id", po."amount_cents",
             pim."source", pim."acquisition_cost_cents", pim."commission_bps"
      FROM "premium_offers" po
      JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=po."premium_domain_id"
      WHERE po."id"=${id}
      LIMIT 1
    `;
    const offer = current[0];
    if (!offer) return jsonError("Offer not found.", 404);

    if (input.action === "ACCEPT" || input.action === "COUNTER") {
      const proposed = input.action === "COUNTER" ? input.counterAmountCents : Number(offer.amount_cents);
      if (offer.source !== "GETSAWA_INVENTORY" && offer.source !== "CUSTOMER_CUSTODY") return jsonError("This inventory source is not eligible for negotiated aftermarket sales.", 409);
      await validatePremiumMarketplaceEconomics({
        source: offer.source,
        salePriceCents: proposed,
        acquisitionCostCents: offer.acquisition_cost_cents,
        commissionBps: Number(offer.commission_bps),
      });
    }

    await decidePremiumOffer({ offerId: id, adminUserId: admin.id, action: input.action, counterAmountCents: input.action === "COUNTER" ? input.counterAmountCents : undefined });

    if (input.action === "ACCEPT") {
      const accepted = await prisma.$queryRaw<Array<{ expires_at: Date | null }>>`
        SELECT "expires_at" FROM "premium_offers" WHERE "id"=${id} AND "status"='ACCEPTED' LIMIT 1
      `;
      const expiresAt = accepted[0]?.expires_at;
      if (!expiresAt) return jsonError("The accepted offer has no valid purchase window.", 409);
      const changed = await prisma.$executeRaw`
        UPDATE "premium_inventory_meta" pim
        SET "reserved_by_user_id"=${offer.buyer_user_id}, "reserved_until"=${expiresAt}, "updated_at"=CURRENT_TIMESTAMP
        FROM "PremiumDomain" pd
        WHERE pim."premium_domain_id"=${offer.premium_domain_id}
          AND pd."id"=pim."premium_domain_id"
          AND pd."status"='LISTED'
          AND pim."sold_at" IS NULL
          AND (pim."reserved_until" IS NULL OR pim."reserved_until" < CURRENT_TIMESTAMP OR pim."reserved_by_user_id"=${offer.buyer_user_id})
      `;
      if (Number(changed) !== 1) {
        await prisma.$executeRaw`UPDATE "premium_offers" SET "status"='EXPIRED', "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        return jsonError("This domain is currently reserved or no longer available.", 409);
      }
      await prisma.$executeRaw`
        UPDATE "premium_offers"
        SET "status"='REJECTED', "decided_by_user_id"=${admin.id}, "decided_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP
        WHERE "premium_domain_id"=${offer.premium_domain_id} AND "id"<>${id} AND "status" IN ('PENDING','COUNTERED')
      `;
    } else if (input.action === "REJECT") {
      await prisma.$executeRaw`
        UPDATE "premium_inventory_meta" SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP
        WHERE "premium_domain_id"=${offer.premium_domain_id} AND "reserved_by_user_id"=${offer.buyer_user_id} AND "sold_at" IS NULL
      `;
    }

    await logAudit({ actorId: admin.id, action: `premium_offer.${input.action.toLowerCase()}`, resource: "premium_offer", resourceId: id, metadata: input.action === "COUNTER" ? { counterAmountCents: input.counterAmountCents } : undefined });
    return jsonOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update this offer.";
    if (message.includes("offer") || message.includes("counter") || message.includes("domain") || message.includes("price") || message.includes("commission") || message.includes("minimum")) return jsonError(message, 400);
    return handleError(err);
  }
}
