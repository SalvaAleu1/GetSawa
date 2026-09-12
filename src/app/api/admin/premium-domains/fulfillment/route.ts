import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listPremiumFulfillmentQueue } from "@/lib/premium-admin";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
    const queue = await listPremiumFulfillmentQueue();
    return jsonOk({ queue });
  } catch (err) {
    return handleError(err);
  }
}
