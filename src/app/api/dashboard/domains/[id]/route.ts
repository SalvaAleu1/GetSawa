import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { computeProtectedTldPrice } from "@/lib/pricing";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const [policy, recentOrders, websiteProjects] = await Promise.all([
      getPricingSafetyPolicy(),
      prisma.orderItem.findMany({
        where: { domainId: domain.id },
        select: {
          id: true,
          description: true,
          totalCents: true,
          provisioningStatus: true,
          createdAt: true,
          order: { select: { orderNumber: true, status: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.websiteProject.findMany({
        where: { domainId: domain.id },
        select: { id: true, name: true, slug: true, status: true, domainConnectionStatus: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const price = computeProtectedTldPrice(domain.tld, policy);
    const daysUntilExpiry = domain.expiresAt
      ? Math.ceil((domain.expiresAt.getTime() - Date.now()) / 86_400_000)
      : null;

    return jsonOk({
      domain: {
        ...domain,
        daysUntilExpiry,
        lifecycle: getLifecycle(daysUntilExpiry, domain.status),
        renewalPriceCents: price.renewCents,
        transferPriceCents: price.transferCents,
        currency: price.currency,
        wholesaleProtected: price.wholesaleAvailable,
        recentOrders,
        websiteProjects,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

function getLifecycle(days: number | null, status: string) {
  if (status === "REGISTRATION_FAILED" || status === "CANCELLED") return "attention";
  if (status === "EXPIRED" || (days != null && days < 0)) return "expired";
  if (days == null) return "pending";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "healthy";
}
