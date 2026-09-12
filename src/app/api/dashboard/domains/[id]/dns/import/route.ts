import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { dnsRecordSchema, normalizeDnsHost } from "@/lib/dns";

const schema = z.object({
  format: z.literal("getsawa-dns-v1").optional(),
  records: z.array(dnsRecordSchema).min(1).max(100),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const input = schema.parse(await req.json());
    const provider = getDomainProvider();
    const created: string[] = [];
    const failed: Array<{ index: number; error: string }> = [];

    for (let index = 0; index < input.records.length; index++) {
      const record = input.records[index];
      if (!record) continue;
      const normalized = { ...record, host: normalizeDnsHost(record.host) };
      try {
        const upstream = await provider.createDnsRecord(domain.name, normalized);
        const saved = await prisma.dnsRecord.create({
          data: {
            domainId: domain.id,
            type: normalized.type,
            host: normalized.host,
            value: normalized.value,
            ttl: normalized.ttl,
            priority: normalized.priority,
            providerRecordId: upstream.providerRecordId,
          },
        });
        created.push(saved.id);
      } catch (err) {
        failed.push({ index, error: err instanceof Error ? err.message : "Provider rejected the record." });
      }
    }

    await logAudit({
      actorId: user.id,
      action: "dns.records.imported",
      resource: "domain",
      resourceId: domain.id,
      metadata: { requested: input.records.length, created: created.length, failed: failed.length },
    });

    return jsonOk({ created: created.length, failed, partialFailure: failed.length > 0 });
  } catch (err) {
    return handleError(err);
  }
}
