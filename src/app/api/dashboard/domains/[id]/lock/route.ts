import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ locked: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const { locked } = schema.parse(await req.json());

    const provider = getDomainProvider();
    if (locked) {
      await provider.lockDomain(domain.name);
    } else {
      await provider.unlockDomain(domain.name);
    }

    const updated = await prisma.domain.update({ where: { id: domain.id }, data: { isLocked: locked } });

    await logAudit({
      actorId: user.id,
      action: locked ? "domain.locked" : "domain.unlocked",
      resource: "domain",
      resourceId: domain.id,
    });

    return jsonOk({ domain: updated });
  } catch (err) {
    return handleError(err);
  }
}
