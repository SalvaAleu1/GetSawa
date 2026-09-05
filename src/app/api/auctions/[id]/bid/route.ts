import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { placeBid, AuctionError } from "@/lib/auctions";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
const schema = z.object({ amountCents: z.number().int().min(100) });
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: RouteContext) {
  try { const user = await requireUser(); const { id } = await params; const rl = checkRateLimit("place-bid", user.id, { max: 20, windowMs: 60_000 }); if (!rl.allowed) return jsonError("Too many bids in a row. Please slow down.", 429); const { amountCents } = schema.parse(await req.json()); const bid = await placeBid(id, user.id, amountCents); await logAudit({ actorId: user.id, action: "auction.bid_placed", resource: "auction", resourceId: id, metadata: { amountCents } }); return jsonOk({ bid }, 201); }
  catch (err) { if (err instanceof AuctionError) return jsonError(err.message, 400); return handleError(err); }
}
