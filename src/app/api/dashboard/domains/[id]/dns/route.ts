import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]),
  host: z.string().max(255),
  value: z.string().min(1).max(1000),
  ttl: z.number().int().min(300).max(86400).optional(),
  priority: z.number().int().min(0).max(65535).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const records = await prisma.dnsRecord.findMany({ where: { domainId: domain.id }, orderBy: { type: "asc" } });
    return jsonOk({ records });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const input = createSchema.parse(await req.json());

    const provider = getDomainProvider();
    // The upstream registrar is the source of truth for DNS. We never claim
    // success locally without it succeeding there first (spec section 11).
    const created = await provider.createDnsRecord(domain.name, input);

    const record = await prisma.dnsRecord.create({
      data: {
        domainId: domain.id,
        type: input.type,
        host: input.host,
        value: input.value,
        ttl: input.ttl ?? 3600,
        priority: input.priority,
        providerRecordId: created.providerRecordId,
      },
    });

    await logAudit({ actorId: user.id, action: "dns.record.created", resource: "domain", resourceId: domain.id });

    return jsonOk({ record }, 201);
  } catch (err) {
    return handleError(err);
  }
}
