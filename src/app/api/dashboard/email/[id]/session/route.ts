import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const rows = await prisma.$queryRaw<Array<{ id: string; provider_resource_id: string; status: string }>>`
      SELECT "id","provider_resource_id","status" FROM "product_service_instances"
      WHERE "id"=${id} AND "user_id"=${user.id} AND "provider_name"='opensrs_hosted_email' LIMIT 1
    `;
    const service = rows[0];
    if (!service) return jsonError("Mailbox service not found.", 404);
    if (service.status !== "ACTIVE") return jsonError("Webmail access is available only while the mailbox service is active.", 409);
    const operational = await getEmailOperationalState();
    if (!operational.verified) return jsonError(operational.reason || "Business email provider is unavailable.", 503);
    const session = await getEmailProvider().createWebmailSession(service.provider_resource_id);
    await logAudit({ actorId: user.id, action: "email.webmail_session_created", resource: "email_service", resourceId: service.id });
    return jsonOk(session);
  } catch (error) {
    return handleError(error);
  }
}
