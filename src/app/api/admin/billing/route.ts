import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const [subscriptions, renewals, pendingOrders, failedPayments] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>`SELECT bs.*,d."name" AS domain_name,u."email" AS customer_email FROM "billing_subscriptions" bs LEFT JOIN "Domain" d ON d."id"=bs."domain_id" JOIN "User" u ON u."id"=bs."user_id" ORDER BY bs."next_billing_at" ASC LIMIT 500`,
      prisma.$queryRaw<Record<string, unknown>[]>`SELECT ra.*,bs."user_id",bs."domain_id",d."name" AS domain_name,u."email" AS customer_email FROM "billing_renewal_attempts" ra JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id" LEFT JOIN "Domain" d ON d."id"=bs."domain_id" JOIN "User" u ON u."id"=bs."user_id" ORDER BY ra."scheduled_at" DESC LIMIT 500`,
      prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.payment.count({ where: { status: "FAILED" } }),
    ]);
    return jsonOk({ subscriptions, renewals, pendingOrders, failedPayments });
  } catch (error) { return handleError(error); }
}
