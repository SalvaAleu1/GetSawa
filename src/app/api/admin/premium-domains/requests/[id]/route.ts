import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { approvePremiumListingRequest, rejectPremiumListingRequest } from "@/lib/premium-seller";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE"), commissionBps: z.number().int().min(1).max(10000), featured: z.boolean().optional().default(false) }),
  z.object({ action: z.literal("REJECT"), note: z.string().trim().max(500).optional() }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const { id } = await params;
    const input = schema.parse(await req.json());
    if (input.action === "APPROVE") {
      const result = await approvePremiumListingRequest({ requestId: id, adminUserId: admin.id, commissionBps: input.commissionBps, featured: input.featured });
      await logAudit({ actorId: admin.id, action: "premium_listing_request.approved", resource: "premium_listing_request", resourceId: id, metadata: { listingId: result.listingId, commissionBps: result.commissionBps } });
      return jsonOk({ result });
    }
    await rejectPremiumListingRequest({ requestId: id, adminUserId: admin.id, note: input.note });
    await logAudit({ actorId: admin.id, action: "premium_listing_request.rejected", resource: "premium_listing_request", resourceId: id, metadata: { note: input.note || null } });
    return jsonOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update this marketplace request.";
    if (message.includes("request") || message.includes("domain") || message.includes("commission") || message.includes("registrar")) return jsonError(message, 400);
    return handleError(err);
  }
}
