import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const [customers, activeDomains, orders30d, openTickets, disputedPayments, failedLogins24h, suspendedCustomers, recentAudit, providers, staff, provisioningFailures] = await Promise.all([
      prisma.user.count({ where: { adminRole: null } }),
      prisma.domain.count({ where: { status: { in: ["ACTIVE", "EXPIRING"] } } }),
      prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
      prisma.payment.count({ where: { status: "DISPUTED" } }),
      prisma.loginEvent.count({ where: { success: false, createdAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { adminRole: null, isSuspended: true } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40, select: { id: true, actorId: true, action: true, resource: true, resourceId: true, metadata: true, createdAt: true } }),
      prisma.providerCredential.findMany({ orderBy: { provider: "asc" }, select: { provider: true, isConfigured: true, isEnabled: true, lastTestedAt: true, lastTestOk: true, lastTestMessage: true, metadata: true } }),
      prisma.user.findMany({ where: { adminRole: { not: null } }, orderBy: [{ adminRole: "asc" }, { email: "asc" }], select: { id: true, email: true, firstName: true, lastName: true, adminRole: true, isSuspended: true, mfaEnabled: true, updatedAt: true } }),
      prisma.orderItem.findMany({ where: { provisioningStatus: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, description: true, provisioningError: true, order: { select: { id: true, orderNumber: true, user: { select: { email: true } } } } } }),
    ]);

    const [paymentQueue, supportQueue, riskOrders] = await Promise.all([
      prisma.payment.findMany({ where: { status: { in: ["PENDING", "FAILED", "DISPUTED"] } }, orderBy: { updatedAt: "desc" }, take: 25, select: { id: true, status: true, amountCents: true, currency: true, failureReason: true, createdAt: true, order: { select: { id: true, orderNumber: true, user: { select: { email: true } } } } } }),
      prisma.supportTicket.findMany({ where: { status: { in: ["OPEN", "PENDING"] } }, orderBy: [{ priority: "desc" }, { updatedAt: "asc" }], take: 25, select: { id: true, subject: true, status: true, priority: true, assignedTo: true, updatedAt: true, user: { select: { email: true } } } }),
      prisma.order.findMany({ where: { createdAt: { gte: thirtyDaysAgo }, totalCents: { gte: 100000 } }, orderBy: { totalCents: "desc" }, take: 15, select: { id: true, orderNumber: true, totalCents: true, currency: true, status: true, createdAt: true, user: { select: { email: true, isSuspended: true } } } }),
    ]);

    let finance30d: { grossCents: number; refundedCents: number; feesCents: number; netCents: number } | null = null;
    let recurring: { pastDue: number; renewalInvoices: number } | null = null;
    let services: Array<{ provider_name: string; status: string; count: number }> = [];
    let websites: { customDomains: number; failedDomains: number } | null = null;
    try {
      const finance = await prisma.$queryRaw<Array<{ gross: bigint; refunded: bigint; fees: bigint; net: bigint }>>`
        SELECT
          COALESCE(SUM(CASE WHEN "event_type"='PAYMENT_CAPTURED' THEN "gross_cents" ELSE 0 END),0) AS gross,
          COALESCE(SUM(CASE WHEN "event_type"='PAYMENT_REFUNDED' THEN "gross_cents" ELSE 0 END),0) AS refunded,
          COALESCE(SUM("provider_fee_cents"),0) AS fees,
          COALESCE(SUM("net_cents"),0) AS net
        FROM "finance_events" WHERE "created_at">=${thirtyDaysAgo}
      `;
      finance30d = { grossCents: Number(finance[0]?.gross ?? 0), refundedCents: Number(finance[0]?.refunded ?? 0), feesCents: Number(finance[0]?.fees ?? 0), netCents: Number(finance[0]?.net ?? 0) };
    } catch {}
    try {
      const rows = await prisma.$queryRaw<Array<{ past_due: bigint; renewal_invoices: bigint }>>`SELECT (SELECT COUNT(*) FROM "billing_subscriptions" WHERE "status"='PAST_DUE') AS past_due,(SELECT COUNT(*) FROM "billing_renewal_attempts" WHERE "status"='ORDER_CREATED') AS renewal_invoices`;
      recurring = { pastDue: Number(rows[0]?.past_due ?? 0), renewalInvoices: Number(rows[0]?.renewal_invoices ?? 0) };
    } catch {}
    try {
      const rows = await prisma.$queryRaw<Array<{ provider_name: string; status: string; count: bigint }>>`SELECT "provider_name","status",COUNT(*) AS count FROM "product_service_instances" GROUP BY "provider_name","status" ORDER BY "provider_name","status"`;
      services = rows.map((row) => ({ provider_name: row.provider_name, status: row.status, count: Number(row.count) }));
    } catch {}
    try {
      const rows = await prisma.$queryRaw<Array<{ total: bigint; failed: bigint }>>`SELECT COUNT(*) AS total,COUNT(*) FILTER (WHERE "status"='FAILED') AS failed FROM "website_custom_domains" WHERE "status"<>'DETACHED'`;
      websites = { customDomains: Number(rows[0]?.total ?? 0), failedDomains: Number(rows[0]?.failed ?? 0) };
    } catch {}

    return jsonOk({
      generatedAt: now.toISOString(),
      viewer: { id: admin.id, role: admin.adminRole },
      kpis: { customers, activeDomains, orders30d, openTickets, disputedPayments, failedLogins24h, suspendedCustomers },
      finance30d,
      recurring,
      websites,
      services,
      queues: { provisioningFailures, paymentQueue, supportQueue },
      riskSignals: { failedLogins24h, suspendedCustomers, disputedPayments, highValueOrders: riskOrders },
      providers,
      staff,
      recentAudit,
    });
  } catch (error) { return handleError(error); }
}
