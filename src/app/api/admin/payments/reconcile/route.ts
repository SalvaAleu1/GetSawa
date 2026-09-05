import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { reconcilePendingPayPalPayments } from "@/lib/payment-reconciliation";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const result = await reconcilePendingPayPalPayments(100);
    await logAudit({
      actorId: admin.id,
      action: "payments.reconciliation.run",
      resource: "payment",
      resourceId: "batch",
      metadata: result,
    });
    return jsonOk(result);
  } catch (error) {
    return handleError(error);
  }
}
