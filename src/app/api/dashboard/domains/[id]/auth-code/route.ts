import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const rl = checkRateLimit("domain-auth-code", user.id, { max: 5, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return jsonError("Too many authorization-code requests. Please try again later.", 429);

    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    if (domain.isLocked) return jsonError("Unlock the domain before requesting its transfer authorization code.", 409);
    if (domain.status !== "ACTIVE" && domain.status !== "EXPIRING" && domain.status !== "EXPIRED") {
      return jsonError("The domain is not currently in a transferable lifecycle state.", 409);
    }

    const provider = getDomainProvider();
    if (!provider.requestAuthCode) return jsonError("The current registrar adapter cannot request EPP authorization codes.", 501);
    const result = await provider.requestAuthCode(domain.name);

    await logAudit({ actorId: user.id, action: "domain.auth_code.requested", resource: "domain", resourceId: domain.id, metadata: { delivery: result.delivery } });
    return jsonOk(result);
  } catch (err) {
    return handleError(err);
  }
}
