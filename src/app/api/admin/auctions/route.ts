import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { AuctionError, createVerifiedAuction } from "@/lib/auctions";

const createSchema = z.object({
  premiumDomainId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  startingBidCents: z.number().int().positive(),
  reservePriceCents: z.number().int().positive().optional(),
  minIncrementCents: z.number().int().positive().default(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  extensionSeconds: z.number().int().min(30).max(900).default(120),
  isFeatured: z.boolean().default(false),
});

export async function GET() {
  try {
    await requireAdmin();
    const auctions = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a.*, ai."premium_domain_id" AS "premiumDomainId", ai."source", ai."seller_user_id" AS "sellerUserId",
             ai."outcome", ai."released_at" AS "releasedAt", pd."renewalPriceCents",
             (SELECT COUNT(*)::int FROM "AuctionBid" b WHERE b."auctionId"=a."id") AS "bidCount",
             (SELECT MAX(b."amountCents") FROM "AuctionBid" b WHERE b."auctionId"=a."id") AS "currentBidCents"
      FROM "Auction" a
      LEFT JOIN "auction_inventory" ai ON ai."auction_id"=a."id"
      LEFT JOIN "PremiumDomain" pd ON pd."id"=ai."premium_domain_id"
      ORDER BY a."createdAt" DESC
      LIMIT 500
    `;
    return jsonOk({ auctions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());
    const auction = await createVerifiedAuction({
      premiumDomainId: input.premiumDomainId,
      title: input.title,
      startingBidCents: input.startingBidCents,
      reservePriceCents: input.reservePriceCents,
      minIncrementCents: input.minIncrementCents,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      extensionSeconds: input.extensionSeconds,
      isFeatured: input.isFeatured,
    });
    await logAudit({ actorId: admin.id, action: "auction.created", resource: "auction", resourceId: auction.id, metadata: { premiumDomainId: input.premiumDomainId, domainName: auction.domainName } });
    return jsonOk({ auction }, 201);
  } catch (err) {
    if (err instanceof AuctionError) return jsonError(err.message, 400);
    return handleError(err);
  }
}
