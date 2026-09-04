import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ autoRenew: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const domain = await getOwnedDomainOrThrow(params.id, user.id);
    const { autoRenew } = schema.parse(await req.json());

    const provider = getDomainProvider();
    if (autoRenew) {
      await provider.enableAutoRenew(domain.name);
    } else {
      await provider.disableAutoRenew(domain.name);
    }

    const updated = await prisma.domain.update({ where: { id: domain.id }, data: { autoRenew } });

    await logAudit({
      actorId: user.id,
      action: autoRenew ? "domain.autorenew.enabled" : "domain.autorenew.disabled",
      resource: "domain",
      resourceId: domain.id,
    });

    return jsonOk({ domain: updated });
  } catch (err) {
    return handleError(err);
  }
}
