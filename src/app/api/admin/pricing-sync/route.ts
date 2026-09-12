import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { syncWholesalePricing } from "@/lib/domain-pricing-sync";

export async function POST() {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const result = await syncWholesalePricing();
    await logAudit({
      actorId: admin.id,
      action: "pricing.wholesale_sync",
      resource: "tld",
      metadata: { ...result },
    });
    return jsonOk({ result });
  } catch (err) {
    return handleError(err);
  }
}
