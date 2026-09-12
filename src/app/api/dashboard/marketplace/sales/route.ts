import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const sales = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ps."id", ps."gross_cents" AS "grossCents", ps."seller_proceeds_cents" AS "sellerProceedsCents",
             ps."platform_revenue_cents" AS "platformRevenueCents", ps."currency",
             ps."settlement_status" AS "settlementStatus", ps."settlement_reference" AS "settlementReference",
             ps."settled_at" AS "settledAt", ps."fulfilled_at" AS "fulfilledAt", ps."created_at" AS "createdAt",
             pd."domainName", o."orderNumber", buyer."email" AS "buyerEmail"
      FROM "premium_sales" ps
      JOIN "PremiumDomain" pd ON pd."id"=ps."premium_domain_id"
      JOIN "OrderItem" oi ON oi."id"=ps."order_item_id"
      JOIN "Order" o ON o."id"=oi."orderId"
      JOIN "User" buyer ON buyer."id"=ps."buyer_user_id"
      WHERE ps."seller_user_id"=${user.id}
      ORDER BY ps."created_at" DESC
      LIMIT 200
    `;

    const summaryRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COALESCE(SUM("seller_proceeds_cents"),0)::bigint AS "lifetimeProceedsCents",
        COALESCE(SUM(CASE WHEN "settlement_status" IN ('PENDING','HELD') THEN "seller_proceeds_cents" ELSE 0 END),0)::bigint AS "outstandingCents",
        COALESCE(SUM(CASE WHEN "settlement_status"='PAID' THEN "seller_proceeds_cents" ELSE 0 END),0)::bigint AS "paidCents",
        COUNT(*)::int AS "saleCount"
      FROM "premium_sales"
      WHERE "seller_user_id"=${user.id}
    `;
    const row = summaryRows[0] ?? {};
    return jsonOk({
      sales,
      summary: {
        lifetimeProceedsCents: Number(row.lifetimeProceedsCents ?? 0),
        outstandingCents: Number(row.outstandingCents ?? 0),
        paidCents: Number(row.paidCents ?? 0),
        saleCount: Number(row.saleCount ?? 0),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
