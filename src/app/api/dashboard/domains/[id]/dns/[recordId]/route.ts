import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]),
  host: z.string().max(255),
  value: z.string().min(1).max(1000),
  ttl: z.number().int().min(300).max(86400).optional(),
  priority: z.number().int().min(0).max(65535).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string; recordId: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const record = await prisma.dnsRecord.findUnique({ where: { id: params.recordId } });
    if (!record || record.domainId !== domain.id) return jsonError("DNS record not found.", 404);

    const input = updateSchema.parse(await req.json());
    const provider = getDomainProvider();
    const updated = await provider.updateDnsRecord(domain.name, record.providerRecordId!, input);

    const saved = await prisma.dnsRecord.update({
      where: { id: record.id },
      data: {
        type: input.type,
        host: input.host,
        value: input.value,
        ttl: input.ttl ?? 3600,
        priority: input.priority,
        providerRecordId: updated.providerRecordId,
      },
    });

    await logAudit({ actorId: user.id, action: "dns.record.updated", resource: "domain", resourceId: domain.id });
    return jsonOk({ record: saved });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; recordId: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const record = await prisma.dnsRecord.findUnique({ where: { id: params.recordId } });
    if (!record || record.domainId !== domain.id) return jsonError("DNS record not found.", 404);

    const provider = getDomainProvider();
    await provider.deleteDnsRecord(domain.name, record.providerRecordId!);
    await prisma.dnsRecord.delete({ where: { id: record.id } });

    await logAudit({ actorId: user.id, action: "dns.record.deleted", resource: "domain", resourceId: domain.id });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
