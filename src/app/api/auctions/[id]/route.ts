import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeAuctionIfExpired } from "@/lib/auctions";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    let auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return jsonError("Auction not found.", 404);
    const inventoryRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ai."premium_domain_id" AS "premiumDomainId", ai."source", ai."seller_user_id" AS "sellerUserId", ai."outcome", ai."released_at" AS "releasedAt",
             pd."renewalPriceCents", pd."currency", pim."ownership_verified_at" AS "ownershipVerifiedAt"
      FROM "auction_inventory" ai
      JOIN "PremiumDomain" pd ON pd."id"=ai."premium_domain_id"
      JOIN "premium_inventory_meta" pim ON pim."premium_domain_id"=pd."id"
      WHERE ai."auction_id"=${id}
      LIMIT 1
    `;
    const inventory = inventoryRows[0];
    if (!inventory?.ownershipVerifiedAt) return jsonError("Auction not found.", 404);

    if (["LIVE", "SCHEDULED"].includes(auction.status) && auction.endAt <= new Date()) auction = await closeAuctionIfExpired(auction.id);
    if (!auction) return jsonError("Auction not found.", 404);

    const bids = await prisma.auctionBid.findMany({ where: { auctionId: id }, orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }], take: 20, select: { id: true, userId: true, amountCents: true, createdAt: true } });
    const user = await getCurrentUser();
    const winnerBid = auction.winningBidId ? bids.find((bid) => bid.id === auction?.winningBidId) : undefined;
    const paymentRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "auction_orders" WHERE "auction_id"=${id} LIMIT 1`;
    const payment = paymentRows[0] ?? null;
    const highest = bids[0];

    return jsonOk({
      auction: {
        ...auction,
        premiumDomainId: String(inventory.premiumDomainId),
        source: String(inventory.source),
        renewalPriceCents: Number(inventory.renewalPriceCents),
        currency: String(inventory.currency),
        outcome: inventory.outcome ? String(inventory.outcome) : null,
      },
      bidCount: await prisma.auctionBid.count({ where: { auctionId: id } }),
      currentBidCents: highest?.amountCents ?? auction.startingBidCents,
      minimumNextBidCents: highest ? highest.amountCents + auction.minIncrementCents : auction.startingBidCents,
      isHighestBidder: Boolean(user && highest?.userId === user.id),
      isWinner: Boolean(user && winnerBid?.userId === user.id),
      canBid: Boolean(user && user.emailVerifiedAt && !user.isSuspended && inventory.sellerUserId !== user.id && auction.status === "LIVE" && auction.endAt > new Date()),
      payment: user && payment?.winner_user_id === user.id ? {
        status: String(payment.status),
        deadline: payment.payment_deadline,
        orderId: payment.order_id,
      } : null,
      bids: bids.map((bid, index) => ({ id: bid.id, amountCents: bid.amountCents, createdAt: bid.createdAt, bidder: index === 0 ? "Highest bidder" : `Bidder #${Math.max(1, bids.length - index)}` })),
    });
  } catch (err) {
    return handleError(err);
  }
}
