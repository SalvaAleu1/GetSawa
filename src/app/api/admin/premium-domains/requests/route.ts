import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listPremiumListingRequestsForAdmin } from "@/lib/premium-seller";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const requests = await listPremiumListingRequestsForAdmin();
    return jsonOk({ requests });
  } catch (err) {
    return handleError(err);
  }
}
