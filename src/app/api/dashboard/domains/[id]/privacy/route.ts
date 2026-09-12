import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ enabled: z.boolean() });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const { enabled } = schema.parse(await req.json());

    if (!domain.tld.supportsPrivacy) return jsonError(`WHOIS privacy is not configured as supported for .${domain.tld.extension}.`, 409);
    if (domain.status === "TRANSFERRED_AWAY" || domain.status === "CANCELLED") return jsonError("Privacy cannot be changed for this domain state.", 409);

    const provider = getDomainProvider();
    const result = await provider.setPrivacy(domain.name, enabled);
    if (!result.supported) return jsonError("The registrar does not support privacy for this domain.", 409);

    const updated = await prisma.domain.update({ where: { id: domain.id }, data: { privacyEnabled: result.enabled } });
    await logAudit({ actorId: user.id, action: result.enabled ? "domain.privacy.enabled" : "domain.privacy.disabled", resource: "domain", resourceId: domain.id });
    return jsonOk({ domain: updated });
  } catch (err) {
    return handleError(err);
  }
}
