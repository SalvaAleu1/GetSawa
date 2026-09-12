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
    const records = await prisma.dnsRecord.findMany({
      where: { domainId: domain.id },
      orderBy: [{ type: "asc" }, { host: "asc" }],
      select: { type: true, host: true, value: true, ttl: true, priority: true },
    });
    return jsonOk({
      format: "getsawa-dns-v1",
      domain: domain.name,
      exportedAt: new Date().toISOString(),
      records,
    });
  } catch (err) {
    return handleError(err);
  }
}
