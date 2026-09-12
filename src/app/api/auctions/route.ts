import { prisma } from "@/lib/prisma";
import { closeAuctionIfExpired } from "@/lib/auctions";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const expired = await prisma.auction.findMany({
      where: { status: { in: ["SCHEDULED", "LIVE"] }, endAt: { lte: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const auction of expired) await closeAuctionIfExpired(auction.id).catch(() => undefined);

    const auctions = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a."id", a."title", a."domainName", a."status", a."startAt", a."endAt", a."isFeatured",
             a."startingBidCents", a."reservePriceCents", a."minIncrementCents", a."extensionSeconds", a."paymentDeadline",
             ai."premium_domain_id" AS "premiumDomainId", ai."source", ai."outcome",
             pd."renewalPriceCents", pd."currency",
             COALESCE((SELECT MAX(b."amountCents") FROM "AuctionBid" b WHERE b."auctionId"=a."id"), a."startingBidCents") AS "currentBidCents",
             (SELECT COUNT(*)::int FROM "AuctionBid" b WHERE b."auctionId"=a."id") AS "bidCount"
      FROM "Auction" a
      JOIN "auction_inventory" ai ON ai."auction_id"=a."id"
      JOIN "PremiumDomain" pd ON pd."id"=ai."premium_domain_id"
      JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=pd."id"
      WHERE pim."ownership_verified_at" IS NOT NULL
        AND a."status" IN ('SCHEDULED','LIVE','ENDED','PAID','COMPLETED')
      ORDER BY a."isFeatured" DESC,
               CASE a."status" WHEN 'LIVE' THEN 0 WHEN 'SCHEDULED' THEN 1 WHEN 'ENDED' THEN 2 WHEN 'PAID' THEN 3 ELSE 4 END,
               a."endAt" ASC
      LIMIT 200
    `;
    return jsonOk({ auctions });
  } catch (err) {
    return handleError(err);
  }
}
