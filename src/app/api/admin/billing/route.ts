import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getFinanceSummary } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const now = new Date();
    const params = new URL(req.url).searchParams;
    const requestedFrom = params.get("from") ? new Date(String(params.get("from"))) : new Date(now.getTime() - 30 * 86400000);
    const requestedTo = params.get("to") ? new Date(String(params.get("to"))) : now;
    const from = Number.isFinite(requestedFrom.getTime()) ? requestedFrom : new Date(now.getTime() - 30 * 86400000);
    const to = Number.isFinite(requestedTo.getTime()) ? requestedTo : now;
    const boundedFrom = new Date(Math.max(from.getTime(), to.getTime() - 366 * 86400000));

    const [subscriptions, renewals, pendingOrders, failedPayments, disputedPayments, financeSummary, creditOutstanding] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>`SELECT bs.*,d."name" AS domain_name,u."email" AS customer_email FROM "billing_subscriptions" bs LEFT JOIN "Domain" d ON d."id"=bs."domain_id" JOIN "User" u ON u."id"=bs."user_id" ORDER BY bs."next_billing_at" ASC LIMIT 500`,
      prisma.$queryRaw<Record<string, unknown>[]>`SELECT ra.*,bs."user_id",bs."domain_id",d."name" AS domain_name,u."email" AS customer_email FROM "billing_renewal_attempts" ra JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id" LEFT JOIN "Domain" d ON d."id"=bs."domain_id" JOIN "User" u ON u."id"=bs."user_id" ORDER BY ra."scheduled_at" DESC LIMIT 500`,
      prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.payment.count({ where: { status: "FAILED" } }),
      prisma.payment.count({ where: { status: "DISPUTED" } }),
      getFinanceSummary({ from: boundedFrom, to }),
      prisma.customerCredit.aggregate({ _sum: { amountCents: true } }),
    ]);
    return jsonOk({
      subscriptions,
      renewals,
      pendingOrders,
      failedPayments,
      disputedPayments,
      finance: { from: boundedFrom.toISOString(), to: to.toISOString(), events: financeSummary },
      creditOutstandingCents: Math.max(0, creditOutstanding._sum.amountCents ?? 0),
    });
  } catch (error) { return handleError(error); }
}
