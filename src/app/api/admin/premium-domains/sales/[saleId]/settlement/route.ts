import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { updatePremiumSaleSettlement } from "@/lib/premium-admin";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  status: z.enum(["PENDING", "HELD", "PAID"]),
  reference: z.string().trim().max(250).optional(),
});
type RouteContext = { params: Promise<{ saleId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const { saleId } = await params;
    const input = schema.parse(await req.json());
    await updatePremiumSaleSettlement({ saleId, adminUserId: admin.id, status: input.status, reference: input.reference });
    await logAudit({ actorId: admin.id, action: `premium_sale.settlement_${input.status.toLowerCase()}`, resource: "premium_sale", resourceId: saleId, metadata: { reference: input.reference || null } });
    return jsonOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update seller settlement.";
    if (message.includes("sale") || message.includes("payout") || message.includes("paid") || message.includes("reference")) return jsonError(message, 400);
    return handleError(err);
  }
}
