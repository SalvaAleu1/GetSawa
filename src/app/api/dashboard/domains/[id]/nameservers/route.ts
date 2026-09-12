import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { isHostname } from "@/lib/dns";

const schema = z.object({ nameservers: z.array(z.string().trim().min(3).max(255)).min(2).max(13) });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const input = schema.parse(await req.json());
    const nameservers = input.nameservers.map((value) => value.toLowerCase().replace(/\.$/, ""));

    if (new Set(nameservers).size !== nameservers.length) return jsonError("Nameservers must be unique.", 400);
    if (nameservers.some((value) => !isHostname(value))) return jsonError("Every nameserver must be a valid hostname.", 400);

    const provider = getDomainProvider();
    await provider.updateNameservers(domain.name, nameservers);
    const updated = await prisma.domain.update({ where: { id: domain.id }, data: { nameservers } });
    await logAudit({
      actorId: user.id,
      action: "domain.nameservers.updated",
      resource: "domain",
      resourceId: domain.id,
      metadata: { previous: domain.nameservers, nameservers },
    });
    return jsonOk({ domain: updated });
  } catch (err) {
    return handleError(err);
  }
}
