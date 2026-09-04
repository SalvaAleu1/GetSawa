import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  nameservers: z.array(z.string().min(3).max(255)).min(2).max(13),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const { nameservers } = schema.parse(await req.json());

    const provider = getDomainProvider();
    await provider.updateNameservers(domain.name, nameservers);

    const updated = await prisma.domain.update({
      where: { id: domain.id },
      data: { nameservers },
    });

    await logAudit({ actorId: user.id, action: "domain.nameservers.updated", resource: "domain", resourceId: domain.id, metadata: { nameservers } });

    return jsonOk({ domain: updated });
  } catch (err) {
    return handleError(err);
  }
}
