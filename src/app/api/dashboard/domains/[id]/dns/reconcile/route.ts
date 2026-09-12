import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const provider = getDomainProvider();
    const upstream = await provider.listDnsRecords(domain.name);

    await prisma.$transaction(async (tx) => {
      await tx.dnsRecord.deleteMany({ where: { domainId: domain.id } });
      if (upstream.length > 0) {
        await tx.dnsRecord.createMany({
          data: upstream.map((record) => ({
            domainId: domain.id,
            type: record.type,
            host: record.host,
            value: record.value,
            ttl: record.ttl ?? 3600,
            priority: record.priority,
            providerRecordId: record.providerRecordId,
          })),
        });
      }
    });

    await logAudit({
      actorId: user.id,
      action: "dns.reconciled",
      resource: "domain",
      resourceId: domain.id,
      metadata: { provider: provider.name, recordCount: upstream.length },
    });

    const records = await prisma.dnsRecord.findMany({ where: { domainId: domain.id }, orderBy: [{ type: "asc" }, { host: "asc" }] });
    return jsonOk({ records, reconciledAt: new Date().toISOString(), provider: provider.name });
  } catch (err) {
    return handleError(err);
  }
}
