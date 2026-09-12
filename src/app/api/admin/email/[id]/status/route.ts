import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { logAudit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["SUSPEND", "REACTIVATE"]) });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "SUPPORT", "FINANCE"]);
    const { id } = await params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Invalid mailbox status action.", 422);
    const rows = await prisma.$queryRaw<Array<{ id: string; user_id: string; provider_resource_id: string; status: string }>>`
      SELECT "id","user_id","provider_resource_id","status" FROM "product_service_instances"
      WHERE "id"=${id} AND "provider_name"='opensrs_hosted_email' LIMIT 1
    `;
    const service = rows[0];
    if (!service) return jsonError("Mailbox service not found.", 404);
    if (service.status === "TERMINATED") return jsonError("A terminated mailbox cannot be changed.", 409);

    const operational = await getEmailOperationalState();
    if (!operational.verified) return jsonError(operational.reason || "Business email provider is unavailable.", 503);
    const provider = getEmailProvider();
    const target = parsed.data.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
    if (service.status === target) return jsonOk({ id: service.id, status: target, unchanged: true });

    if (parsed.data.action === "SUSPEND") await provider.suspendMailbox(service.provider_resource_id);
    else await provider.reactivateMailbox(service.provider_resource_id);
    await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"=${target},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
    await logAudit({ actorId: admin.id, action: parsed.data.action === "SUSPEND" ? "email.admin_suspended" : "email.admin_reactivated", resource: "email_service", resourceId: service.id, metadata: { customerId: service.user_id } });
    return jsonOk({ id: service.id, status: target });
  } catch (error) {
    return handleError(error);
  }
}
