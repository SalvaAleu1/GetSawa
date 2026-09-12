import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { listSellerPremiumRequests, submitPremiumListingRequest } from "@/lib/premium-seller";

const schema = z.object({
  domainId: z.string().min(1),
  askingPriceCents: z.number().int().positive(),
  category: z.string().trim().max(100).optional(),
  termsAccepted: z.literal(true),
});

export async function GET() {
  try {
    const user = await requireUser();
    const requests = await listSellerPremiumRequests(user.id);
    return jsonOk({ requests });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const limit = checkRateLimit("premium-listing-request", user.id, { max: 5, windowMs: 60_000 });
    if (!limit.allowed) return jsonError("Too many listing requests. Please wait and try again.", 429);
    const input = schema.parse(await req.json());
    const request = await submitPremiumListingRequest({ sellerUserId: user.id, domainId: input.domainId, askingPriceCents: input.askingPriceCents, category: input.category });
    await logAudit({ actorId: user.id, action: "premium_listing_request.created", resource: "premium_listing_request", resourceId: request.id, metadata: { domainId: input.domainId, askingPriceCents: input.askingPriceCents } });
    return jsonOk({ request }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not submit this domain for marketplace review.";
    if (message.includes("domain") || message.includes("price") || message.includes("marketplace")) return jsonError(message, 400);
    return handleError(err);
  }
}
