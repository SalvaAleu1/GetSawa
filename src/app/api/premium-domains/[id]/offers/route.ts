import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createPremiumOffer } from "@/lib/premium-aftermarket";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({ amountCents: z.number().int().positive().max(100_000_000_00) });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const limit = checkRateLimit("premium-offer", user.id, { max: 10, windowMs: 60_000 });
    if (!limit.allowed) return jsonError("Too many offer attempts. Please wait a moment and try again.", 429);
    const { id } = await params;
    const { amountCents } = schema.parse(await req.json());
    const offer = await createPremiumOffer({ premiumDomainId: id, buyerUserId: user.id, amountCents });
    await logAudit({ actorId: user.id, action: "premium_offer.created", resource: "premium_offer", resourceId: offer.id, metadata: { premiumDomainId: id, amountCents } });
    return jsonOk({ offer }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not submit this offer.";
    if (message.includes("offer") || message.includes("domain")) return jsonError(message, 400);
    return handleError(err);
  }
}
