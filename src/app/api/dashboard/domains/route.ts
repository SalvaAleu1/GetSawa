import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

const SORTS = new Set(["newest", "name", "expiry_asc", "expiry_desc"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const status = (searchParams.get("status") || "ALL").toUpperCase();
    const sort = searchParams.get("sort") || "newest";

    if (!SORTS.has(sort)) return jsonError("Unknown sort option.", 400);

    const where = {
      userId: user.id,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      ...(status !== "ALL" ? { status: status as any } : {}),
    };

    const orderBy = sort === "name"
      ? ({ name: "asc" } as const)
      : sort === "expiry_asc"
        ? ({ expiresAt: "asc" } as const)
        : sort === "expiry_desc"
          ? ({ expiresAt: "desc" } as const)
          : ({ createdAt: "desc" } as const);

    const [domains, allDomains] = await Promise.all([
      prisma.domain.findMany({
        where,
        include: { tld: true, websiteProjects: { select: { id: true, name: true, status: true } } },
        orderBy,
      }),
      prisma.domain.findMany({
        where: { userId: user.id },
        select: { id: true, status: true, expiresAt: true, autoRenew: true, isLocked: true },
      }),
    ]);

    const now = Date.now();
    const enriched = domains.map((domain) => ({
      ...domain,
      lifecycle: getLifecycle(domain.expiresAt, domain.status),
      daysUntilExpiry: domain.expiresAt ? Math.ceil((domain.expiresAt.getTime() - now) / 86_400_000) : null,
    }));

    const stats = {
      total: allDomains.length,
      active: allDomains.filter((d) => d.status === "ACTIVE").length,
      expiringSoon: allDomains.filter((d) => {
        if (!d.expiresAt) return false;
        const days = Math.ceil((d.expiresAt.getTime() - now) / 86_400_000);
        return days >= 0 && days <= 30;
      }).length,
      expired: allDomains.filter((d) => d.status === "EXPIRED" || (d.expiresAt?.getTime() ?? Infinity) < now).length,
      autoRenewOff: allDomains.filter((d) => !d.autoRenew).length,
      unlocked: allDomains.filter((d) => !d.isLocked).length,
    };

    return jsonOk({ domains: enriched, stats, filters: { q, status, sort } });
  } catch (err) {
    return handleError(err);
  }
}

function getLifecycle(expiresAt: Date | null, status: string) {
  if (status === "REGISTRATION_FAILED" || status === "CANCELLED") return "attention";
  if (status === "EXPIRED") return "expired";
  if (!expiresAt) return "pending";
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "healthy";
}
