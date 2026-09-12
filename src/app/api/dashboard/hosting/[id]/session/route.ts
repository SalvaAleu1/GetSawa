import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getHostingOperationalState } from "@/lib/hosting-readiness";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const rows = await prisma.$queryRaw<Array<{ id: string; provider_resource_id: string; status: string }>>`
      SELECT "id","provider_resource_id","status" FROM "product_service_instances"
      WHERE "id"=${id} AND "user_id"=${user.id} AND "provider_name"='cpanel_whm' LIMIT 1
    `;
    const service = rows[0];
    if (!service) return jsonError("Hosting service not found.", 404);
    if (service.status !== "ACTIVE") return jsonError("cPanel access is available only while the hosting service is active.", 409);

    const operational = await getHostingOperationalState();
    if (!operational.verified) return jsonError(operational.reason || "WHM hosting is temporarily unavailable.", 503, { code: "HOSTING_PROVIDER_UNAVAILABLE" });

    const session = await getHostingProvider().createControlPanelSession(service.provider_resource_id);
    await logAudit({ actorId: user.id, action: "hosting.cpanel_session_created", resource: "hosting_service", resourceId: service.id }).catch(() => undefined);
    return jsonOk({ url: session.url, expiresAt: session.expiresAt });
  } catch (error) {
    return handleError(error);
  }
}
