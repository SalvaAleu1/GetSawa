import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const rawDays = Number(searchParams.get("days") || 30);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.trunc(rawDays), 1), 365) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const expiryHorizon = new Date(Date.now() + 30 * 86400000);

    const [totalCustomers, activeCustomers, totalDomains, domainsThisPeriod, expiringSoon, expiredDomains, revenueAgg, pendingPayments, failedPayments, refunds, openTickets, activePromotions, provisioningPending, provisioningFailed, recentOrders] = await Promise.all([
      prisma.user.count({ where: { adminRole: null } }),
      prisma.user.count({ where: { adminRole: null, isSuspended: false } }),
      prisma.domain.count({ where: { status: "ACTIVE" } }),
      prisma.domain.count({ where: { registeredAt: { gte: since } } }),
      prisma.domain.count({ where: { status: "ACTIVE", expiresAt: { lte: expiryHorizon } } }),
      prisma.domain.count({ where: { status: "EXPIRED" } }),
      prisma.payment.aggregate({ where: { status: "PAID", createdAt: { gte: since } }, _sum: { amountCents: true } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
      prisma.refund.count({ where: { createdAt: { gte: since } } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
      prisma.promotion.count({ where: { isActive: true } }),
      prisma.orderItem.count({ where: { provisioningStatus: { in: ["PENDING", "PROVISIONING"] }, order: { status: { in: ["PAYMENT_CONFIRMED", "PROVISIONING"] } } } }),
      prisma.orderItem.count({ where: { provisioningStatus: "FAILED", order: { status: { in: ["PAYMENT_CONFIRMED", "PROVISIONING"] } } } }),
      prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { email: true } } } }),
    ]);

    return jsonOk({ periodDays: days, totalCustomers, activeCustomers, totalDomains, domainsThisPeriod, expiringSoon, expiredDomains, revenueCentsThisPeriod: revenueAgg._sum.amountCents ?? 0, pendingPayments, failedPayments, refunds, openTickets, activePromotions, provisioningPending, provisioningFailed, recentOrders });
  } catch (err) {
    return handleError(err);
  }
}
