import { requireUser } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listCustomerSubscriptions, listRenewalAttemptsForUser } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [subscriptions, renewals] = await Promise.all([
      listCustomerSubscriptions(user.id),
      listRenewalAttemptsForUser(user.id),
    ]);
    return jsonOk({ subscriptions, renewals });
  } catch (error) {
    return handleError(error);
  }
}
