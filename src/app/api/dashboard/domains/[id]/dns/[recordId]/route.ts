import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { dnsRecordSchema, normalizeDnsHost } from "@/lib/dns";

type RouteContext = { params: Promise<{ id: string; recordId: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id, recordId } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const record = await prisma.dnsRecord.findUnique({ where: { id: recordId } });
    if (!record || record.domainId !== domain.id) return jsonError("DNS record not found.", 404);
    if (!record.providerRecordId) return jsonError("This DNS record is not linked to a registrar record. Reconcile DNS before editing it.", 409);

    const parsed = dnsRecordSchema.parse(await req.json());
    const input = { ...parsed, host: normalizeDnsHost(parsed.host) };
    const updated = await getDomainProvider().updateDnsRecord(domain.name, record.providerRecordId, input);
    const saved = await prisma.dnsRecord.update({
      where: { id: record.id },
      data: {
        type: input.type,
        host: input.host,
        value: input.value,
        ttl: input.ttl,
        priority: input.priority,
        providerRecordId: updated.providerRecordId,
      },
    });
    await logAudit({
      actorId: user.id,
      action: "dns.record.updated",
      resource: "domain",
      resourceId: domain.id,
      metadata: { recordId: record.id, type: input.type, host: input.host, ttl: input.ttl },
    });
    return jsonOk({ record: saved });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id, recordId } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const record = await prisma.dnsRecord.findUnique({ where: { id: recordId } });
    if (!record || record.domainId !== domain.id) return jsonError("DNS record not found.", 404);
    if (!record.providerRecordId) return jsonError("This DNS record is not linked to a registrar record. Reconcile DNS before deleting it.", 409);

    await getDomainProvider().deleteDnsRecord(domain.name, record.providerRecordId);
    await prisma.dnsRecord.delete({ where: { id: record.id } });
    await logAudit({
      actorId: user.id,
      action: "dns.record.deleted",
      resource: "domain",
      resourceId: domain.id,
      metadata: { recordId: record.id, type: record.type, host: record.host },
    });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
