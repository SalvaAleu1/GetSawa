import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class AuctionError extends Error {}

/**
 * Places a bid using a SERIALIZABLE transaction: the current highest bid is
 * read and the new bid inserted within the same transaction, so two
 * simultaneous bids can never both be accepted as "the highest" — Postgres
 * will abort one with a serialization failure, which we retry a few times
 * (spec section 148 — bid safety).
 */
export async function placeBid(auctionId: string, userId: string, amountCents: number) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const auction = await tx.auction.findUnique({ where: { id: auctionId } });
          if (!auction) throw new AuctionError("Auction not found.");

          const now = new Date();
          if (auction.status !== "LIVE") {
            if (auction.status === "SCHEDULED" && auction.startAt <= now && auction.endAt > now) {
              await tx.auction.update({ where: { id: auction.id }, data: { status: "LIVE" } });
            } else {
              throw new AuctionError("This auction is not currently accepting bids.");
            }
          }
          if (auction.endAt <= now) {
            throw new AuctionError("This auction has ended.");
          }

          const highest = await tx.auctionBid.findFirst({
            where: { auctionId: auction.id },
            orderBy: { amountCents: "desc" },
          });

          const minimumNext = highest
            ? highest.amountCents + auction.minIncrementCents
            : auction.startingBidCents;

          if (amountCents < minimumNext) {
            throw new AuctionError(`Bid must be at least ${(minimumNext / 100).toFixed(2)}.`);
          }
          if (highest && highest.userId === userId) {
            throw new AuctionError("You already have the highest bid.");
          }

          const bid = await tx.auctionBid.create({
            data: { auctionId: auction.id, userId, amountCents },
          });

          // Anti-sniping: if this bid landed inside the closing window,
          // push the end time back so bidders get a fair chance to respond.
          const closingWindowMs = auction.extensionSeconds * 1000;
          const msUntilEnd = auction.endAt.getTime() - now.getTime();
          if (msUntilEnd < closingWindowMs) {
            await tx.auction.update({
              where: { id: auction.id },
              data: { endAt: new Date(now.getTime() + closingWindowMs) },
            });
          }

          return bid;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err: any) {
      const isSerializationFailure = err?.code === "P2034" || /could not serialize/i.test(err?.message ?? "");
      if (isSerializationFailure && attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }
  throw new AuctionError("Could not place your bid right now — please try again.");
}

/**
 * Closes an auction whose end time has passed: determines the winner (the
 * highest bid, if it meets any reserve price), sets a payment deadline, and
 * marks the auction ENDED. Safe to call repeatedly — a non-LIVE/SCHEDULED
 * auction is a no-op.
 */
export async function closeAuctionIfExpired(auctionId: string) {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return null;
    if (!["LIVE", "SCHEDULED"].includes(auction.status)) return auction;
    if (auction.endAt > new Date()) return auction;

    const highest = await tx.auctionBid.findFirst({
      where: { auctionId: auction.id },
      orderBy: { amountCents: "desc" },
    });

    const reserveMet = !auction.reservePriceCents || (highest && highest.amountCents >= auction.reservePriceCents);

    return tx.auction.update({
      where: { id: auction.id },
      data: {
        status: "ENDED",
        winningBidId: highest && reserveMet ? highest.id : null,
        paymentDeadline: highest && reserveMet ? new Date(Date.now() + 48 * 60 * 60 * 1000) : null,
      },
    });
  });
}
