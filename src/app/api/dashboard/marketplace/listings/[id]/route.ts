import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { withdrawPremiumListingRequest } from "@/lib/premium-seller";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await withdrawPremiumListingRequest(id, user.id);
    await logAudit({ actorId: user.id, action: "premium_listing_request.withdrawn", resource: "premium_listing_request", resourceId: id });
    return jsonOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not withdraw this listing request.";
    if (message.includes("withdrawn")) return jsonError(message, 409);
    return handleError(err);
  }
}
