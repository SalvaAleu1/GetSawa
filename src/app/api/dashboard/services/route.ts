import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Unified customer service inventory. It deliberately derives state from
 * authoritative Domain, WebsiteProject and paid OrderItem records instead
 * of maintaining a second, drift-prone service table.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const [domains, websites, orderItems] = await Promise.all([
      prisma.domain.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          status: true,
          expiresAt: true,
          autoRenew: true,
          providerName: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.websiteProject.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, slug: true, status: true, domainId: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.orderItem.findMany({
        where: {
          order: { userId: user.id, status: { in: ["PAYMENT_CONFIRMED", "PROVISIONING", "ACTIVE"] } },
          provisioningStatus: { in: ["PENDING", "PROVISIONING", "FAILED", "PROVISIONED"] },
        },
        select: {
          id: true,
          description: true,
          provisioningStatus: true,
          provisioningNote: true,
          product: { select: { name: true, category: true, billingCycle: true } },
          order: { select: { id: true, orderNumber: true, status: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const now = Date.now();
    const domainSummary = domains.reduce(
      (acc, domain) => {
        acc.total += 1;
        if (domain.status === "ACTIVE") acc.active += 1;
        if (domain.status === "EXPIRED") acc.expired += 1;
        if (domain.expiresAt && domain.expiresAt.getTime() <= now + 30 * 86400000 && domain.status === "ACTIVE") acc.expiringSoon += 1;
        return acc;
      },
      { total: 0, active: 0, expired: 0, expiringSoon: 0 },
    );

    const fulfilment = orderItems.map((item) => ({
      id: item.id,
      name: item.product?.name || item.description,
      category: item.product?.category || "DOMAIN",
      billingCycle: item.product?.billingCycle || "ONE_TIME",
      provisioningStatus: item.provisioningStatus,
      note: item.provisioningNote,
      orderId: item.order.id,
      orderNumber: item.order.orderNumber,
      orderStatus: item.order.status,
      createdAt: item.order.createdAt,
    }));

    return jsonOk({
      summary: { domains: domainSummary, websites: websites.length, fulfilmentItems: fulfilment.length },
      domains,
      websites,
      fulfilment,
    });
  } catch (error) {
    return handleError(error);
  }
}
