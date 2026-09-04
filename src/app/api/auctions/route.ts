import { prisma } from "@/lib/prisma";
import { closeAuctionIfExpired } from "@/lib/auctions";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const auctions = await prisma.auction.findMany({
      where: { status: { in: ["SCHEDULED", "LIVE", "ENDED"] } },
      orderBy: [{ isFeatured: "desc" }, { endAt: "asc" }],
      include: { bids: { orderBy: { amountCents: "desc" }, take: 1 }, _count: { select: { bids: true } } },
    });

    // Lazily close any auction whose end time has passed since it was last touched.
    for (const a of auctions) {
      if (["LIVE", "SCHEDULED"].includes(a.status) && a.endAt <= new Date()) {
        await closeAuctionIfExpired(a.id);
      }
    }

    const refreshed = await prisma.auction.findMany({
      where: { status: { in: ["SCHEDULED", "LIVE", "ENDED"] } },
      orderBy: [{ isFeatured: "desc" }, { endAt: "asc" }],
      include: { bids: { orderBy: { amountCents: "desc" }, take: 1 }, _count: { select: { bids: true } } },
    });

    return jsonOk({
      auctions: refreshed.map((a) => ({
        id: a.id,
        title: a.title,
        domainName: a.domainName,
        status: a.status,
        startAt: a.startAt,
        endAt: a.endAt,
        isFeatured: a.isFeatured,
        startingBidCents: a.startingBidCents,
        currentBidCents: a.bids[0]?.amountCents ?? a.startingBidCents,
        bidCount: a._count.bids,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
