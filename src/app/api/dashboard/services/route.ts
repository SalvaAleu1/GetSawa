import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getCustomerServiceInstances } from "@/lib/product-provisioning";

export const dynamic = "force-dynamic";

/**
 * Unified customer service inventory. Domain and website state comes from
 * their authoritative models; provisioned catalog products come from the
 * provider-backed service-instance ledger created only after fulfilment.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const [domains, websites, orderItems, serviceInstances] = await Promise.all([
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
          provisioningStatus: { in: ["PENDING", "PROVISIONING", "FAILED"] },
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
      getCustomerServiceInstances(user.id),
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
      summary: {
        domains: domainSummary,
        websites: websites.length,
        activeCatalogServices: serviceInstances.filter((service) => service.status === "ACTIVE").length,
        fulfilmentItems: fulfilment.length,
      },
      domains,
      websites,
      services: serviceInstances,
      fulfilment,
    });
  } catch (error) {
    return handleError(error);
  }
}
