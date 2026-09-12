import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const events = await prisma.auditLog.findMany({
      where: {
        resource: "domain",
        resourceId: domain.id,
        action: { startsWith: "dns." },
      },
      select: { id: true, action: true, metadata: true, ipAddress: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk({ events });
  } catch (err) {
    return handleError(err);
  }
}
