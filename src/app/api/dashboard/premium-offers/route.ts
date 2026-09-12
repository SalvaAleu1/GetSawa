import { requireUser } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listPremiumOffersForBuyer } from "@/lib/premium-aftermarket";

export async function GET() {
  try {
    const user = await requireUser();
    const offers = await listPremiumOffersForBuyer(user.id);
    return jsonOk({ offers });
  } catch (err) {
    return handleError(err);
  }
}
