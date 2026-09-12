import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeAuctionIfExpired, expireUnpaidAuctionWinners } from "@/lib/auctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const auctions = await prisma.auction.findMany({
    where: { status: { in: ["LIVE", "SCHEDULED"] }, endAt: { lte: now } },
    select: { id: true },
    take: 200,
  });

  let closed = 0;
  let failures = 0;
  for (const auction of auctions) {
    try {
      const result = await closeAuctionIfExpired(auction.id);
      if (result?.status === "ENDED") closed += 1;
    } catch (error) {
      failures += 1;
      console.error("[auction-close] failed", auction.id, error);
    }
  }

  const expiredWinnerPayments = await expireUnpaidAuctionWinners(200);
  return NextResponse.json({ ok: failures === 0, inspected: auctions.length, closed, expiredWinnerPayments, failures, timestamp: new Date().toISOString() });
}
