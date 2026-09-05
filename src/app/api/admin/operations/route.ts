import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [db, failedProvisioning, pendingPayments, failedPayments, disputedPayments, expiring7, expiring30, expiredDomains, openTickets, suspendedCustomers, recentAudit] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => "operational" as const).catch(() => "unavailable" as const),
      prisma.orderItem.count({ where: { provisioningStatus: "FAILED", order: { status: { in: ["PAYMENT_CONFIRMED", "PROVISIONING"] } } } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 24 * 86400000) } } }),
      prisma.payment.count({ where: { status: "DISPUTED" } }),
      prisma.domain.count({ where: { status: "ACTIVE", expiresAt: { gt: now, lte: in7Days } } }),
      prisma.domain.count({ where: { status: "ACTIVE", expiresAt: { gt: now, lte: in30Days } } }),
      prisma.domain.count({ where: { status: "EXPIRED" } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
      prisma.user.count({ where: { adminRole: null, isSuspended: true } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { id: true, action: true, resource: true, resourceId: true, createdAt: true, actorId: true } }),
    ]);

    let pastDueRenewals = 0;
    let renewalOrdersPending = 0;
    try {
      const rows = await prisma.$queryRaw<Array<{ past_due: bigint; pending_orders: bigint }>>`
        SELECT
          (SELECT COUNT(*) FROM billing_subscriptions WHERE status = 'PAST_DUE') AS past_due,
          (SELECT COUNT(*) FROM billing_renewal_attempts WHERE status = 'ORDER_CREATED') AS pending_orders
      `;
      pastDueRenewals = Number(rows[0]?.past_due ?? 0);
      renewalOrdersPending = Number(rows[0]?.pending_orders ?? 0);
    } catch {
      // Billing migration may not yet be deployed. Keep the rest of the ops panel usable.
    }

    return jsonOk({
      generatedAt: now.toISOString(),
      database: db,
      alerts: {
        failedProvisioning,
        pendingPayments,
        failedPayments24h: failedPayments,
        disputedPayments,
        expiringDomains7d: expiring7,
        expiredDomains,
        openTickets,
        pastDueRenewals,
        renewalOrdersPending,
      },
      indicators: { expiringDomains30d: expiring30, suspendedCustomers },
      recentAudit,
    });
  } catch (err) {
    return handleError(err);
  }
}
