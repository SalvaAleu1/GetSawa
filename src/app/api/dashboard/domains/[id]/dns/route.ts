import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { dnsRecordSchema, normalizeDnsHost } from "@/lib/dns";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const records = await prisma.dnsRecord.findMany({
      where: { domainId: domain.id },
      orderBy: [{ type: "asc" }, { host: "asc" }],
    });
    return jsonOk({ records });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const parsed = dnsRecordSchema.parse(await req.json());
    const input = { ...parsed, host: normalizeDnsHost(parsed.host) };
    const created = await getDomainProvider().createDnsRecord(domain.name, input);
    const record = await prisma.dnsRecord.create({
      data: {
        domainId: domain.id,
        type: input.type,
        host: input.host,
        value: input.value,
        ttl: input.ttl,
        priority: input.priority,
        providerRecordId: created.providerRecordId,
      },
    });
    await logAudit({
      actorId: user.id,
      action: "dns.record.created",
      resource: "domain",
      resourceId: domain.id,
      metadata: { type: input.type, host: input.host, ttl: input.ttl },
    });
    return jsonOk({ record }, 201);
  } catch (err) {
    return handleError(err);
  }
}
