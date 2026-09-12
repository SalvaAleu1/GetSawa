import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { actOnBuyerPremiumOffer } from "@/lib/premium-aftermarket";

const schema = z.object({ action: z.enum(["ACCEPT_COUNTER", "WITHDRAW"]) });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action } = schema.parse(await req.json());
    const before = await prisma.$queryRaw<Array<{ premium_domain_id: string; status: string }>>`
      SELECT "premium_domain_id","status" FROM "premium_offers" WHERE "id"=${id} AND "buyer_user_id"=${user.id} LIMIT 1
    `;
    if (!before[0]) return jsonError("Offer not found.", 404);

    await actOnBuyerPremiumOffer({ offerId: id, buyerUserId: user.id, action });

    if (action === "ACCEPT_COUNTER") {
      const rows = await prisma.$queryRaw<Array<{ premium_domain_id: string; expires_at: Date | null }>>`
        SELECT "premium_domain_id","expires_at" FROM "premium_offers" WHERE "id"=${id} AND "buyer_user_id"=${user.id} AND "status"='ACCEPTED' LIMIT 1
      `;
      const offer = rows[0];
      if (!offer?.expires_at) return jsonError("The accepted offer has no valid checkout window.", 409);
      const changed = await prisma.$executeRaw`
        UPDATE "premium_inventory_meta" pim
        SET "reserved_by_user_id"=${user.id}, "reserved_until"=${offer.expires_at}, "updated_at"=CURRENT_TIMESTAMP
        FROM "PremiumDomain" pd
        WHERE pim."premium_domain_id"=${offer.premium_domain_id}
          AND pd."id"=pim."premium_domain_id"
          AND pd."status"='LISTED'
          AND pim."sold_at" IS NULL
          AND (pim."reserved_until" IS NULL OR pim."reserved_until" < CURRENT_TIMESTAMP OR pim."reserved_by_user_id"=${user.id})
      `;
      if (Number(changed) !== 1) {
        await prisma.$executeRaw`UPDATE "premium_offers" SET "status"='EXPIRED', "updated_at"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        return jsonError("This domain is no longer available for the counter-offer.", 409);
      }
    } else {
      await prisma.$executeRaw`
        UPDATE "premium_inventory_meta"
        SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP
        WHERE "premium_domain_id"=${before[0].premium_domain_id} AND "reserved_by_user_id"=${user.id} AND "sold_at" IS NULL
      `;
    }

    await logAudit({ actorId: user.id, action: action === "ACCEPT_COUNTER" ? "premium_offer.counter_accepted" : "premium_offer.withdrawn", resource: "premium_offer", resourceId: id });
    return jsonOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update this offer.";
    if (message.includes("offer") || message.includes("counter") || message.includes("withdraw")) return jsonError(message, 400);
    return handleError(err);
  }
}
