import { prisma } from "@/lib/prisma";
import { AuctionError } from "@/lib/auctions";

export async function cancelAuctionAndRelease(auctionId: string, reason: string) {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 5) throw new AuctionError("A cancellation reason is required.");

  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new AuctionError("Auction not found.");
    if (!["DRAFT", "SCHEDULED", "LIVE"].includes(auction.status)) throw new AuctionError("This auction can no longer be cancelled through the standard workflow.");

    const paymentRows = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "auction_orders" WHERE "auction_id"=${auction.id} LIMIT 1`;
    if (paymentRows[0]) throw new AuctionError("An auction with a winner-payment record cannot be cancelled through the standard workflow.");
    const inventoryRows = await tx.$queryRaw<Array<{ premium_domain_id: string; released_at: Date | null }>>`SELECT "premium_domain_id","released_at" FROM "auction_inventory" WHERE "auction_id"=${auction.id} LIMIT 1`;
    const inventory = inventoryRows[0];
    if (!inventory) throw new AuctionError("Auction inventory linkage is missing.");

    const updated = await tx.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } });
    if (!inventory.released_at) {
      await tx.premiumDomain.update({ where: { id: inventory.premium_domain_id }, data: { status: "LISTED", isAuction: false } });
      await tx.$executeRaw`UPDATE "premium_inventory_meta" SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP WHERE "premium_domain_id"=${inventory.premium_domain_id} AND "sold_at" IS NULL`;
      await tx.$executeRaw`UPDATE "auction_inventory" SET "outcome"='ADMIN_CANCELLED', "released_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${auction.id}`;
    }
    return { auction: updated, reason: normalizedReason };
  });
}
