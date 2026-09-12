import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listPremiumOffersForAdmin } from "@/lib/premium-aftermarket";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const offers = await listPremiumOffersForAdmin();
    return jsonOk({ offers });
  } catch (err) {
    return handleError(err);
  }
}
