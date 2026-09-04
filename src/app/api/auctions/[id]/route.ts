import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeAuctionIfExpired } from "@/lib/auctions";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    let auction = await prisma.auction.findUnique({ where: { id: params.id } });
    if (!auction) return jsonError("Auction not found.", 404);

    if (["LIVE", "SCHEDULED"].includes(auction.status) && auction.endAt <= new Date()) {
      auction = await closeAuctionIfExpired(auction.id);
    }

    const bids = await prisma.auctionBid.findMany({
      where: { auctionId: params.id },
      orderBy: { amountCents: "desc" },
      take: 20,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const user = await getCurrentUser();
    const isWinner = Boolean(user && auction?.winningBidId && bids.find((b) => b.id === auction!.winningBidId)?.userId === user.id);

    return jsonOk({
      auction,
      isWinner,
      bids: bids.map((b, i) => ({
        id: b.id,
        amountCents: b.amountCents,
        createdAt: b.createdAt,
        bidder: i === 0 ? "Highest bidder" : `Bidder #${bids.length - i}`, // never expose other customers' identities
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
