import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listPremiumSales } from "@/lib/premium-admin";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const sales = await listPremiumSales();
    return jsonOk({ sales });
  } catch (err) {
    return handleError(err);
  }
}
