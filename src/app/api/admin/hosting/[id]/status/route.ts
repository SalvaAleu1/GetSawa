import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getHostingOperationalState } from "@/lib/hosting-readiness";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { logAudit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["SUSPEND", "UNSUSPEND"]), reason: z.string().trim().max(300).optional() });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"]);
    const { id } = await params;
    const input = schema.parse(await req.json());
    const rows = await prisma.$queryRaw<Array<{ id: string; user_id: string; provider_resource_id: string; status: string }>>`
      SELECT "id","user_id","provider_resource_id","status" FROM "product_service_instances"
      WHERE "id"=${id} AND "provider_name"='cpanel_whm' LIMIT 1
    `;
    const service = rows[0];
    if (!service) return jsonError("Hosting service not found.", 404);
    if (service.status === "TERMINATED") return jsonError("A terminated hosting service cannot be changed.", 409);

    const operational = await getHostingOperationalState();
    if (!operational.verified) return jsonError(operational.reason || "WHM hosting is not operational.", 503, { code: "HOSTING_PROVIDER_UNAVAILABLE" });

    const provider = getHostingProvider();
    if (input.action === "SUSPEND") {
      if (service.status !== "SUSPENDED") await provider.suspendAccount(service.provider_resource_id, input.reason || "Suspended by GetSawa staff");
      await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENDED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
    } else {
      if (service.status !== "ACTIVE") await provider.unsuspendAccount(service.provider_resource_id);
      await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='ACTIVE',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
    }

    await logAudit({
      actorId: admin.id,
      action: input.action === "SUSPEND" ? "hosting.suspended_by_staff" : "hosting.unsuspended_by_staff",
      resource: "hosting_service",
      resourceId: service.id,
      metadata: { customerId: service.user_id, reason: input.reason || null },
    });
    return jsonOk({ id: service.id, status: input.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE" });
  } catch (error) {
    return handleError(error);
  }
}
