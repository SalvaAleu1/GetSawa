import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { logAudit } from "@/lib/audit";

const schema = z.object({ password: z.string().min(12).max(54) });
type RouteContext = { params: Promise<{ id: string }> };

function validProviderPassword(password: string) {
  // Printable ASCII, excluding space and double quote. These match the safe
  // subset accepted by the OpenSRS Hosted Email password contract.
  return /^[!#-~]{12,54}$/.test(password);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success || !validProviderPassword(parsed.data?.password || "")) {
      return jsonError("Use 12–54 printable characters without spaces or double quotes.", 422);
    }

    const rows = await prisma.$queryRaw<Array<{ id: string; provider_resource_id: string; status: string; metadata: unknown }>>`
      SELECT "id","provider_resource_id","status","metadata" FROM "product_service_instances"
      WHERE "id"=${id} AND "user_id"=${user.id} AND "provider_name"='opensrs_hosted_email' LIMIT 1
    `;
    const service = rows[0];
    if (!service) return jsonError("Mailbox service not found.", 404);
    if (!["ACTIVE", "SUSPENDED"].includes(service.status)) return jsonError("Password cannot be changed for this mailbox state.", 409);

    const [localPart, domain] = service.provider_resource_id.toLowerCase().split("@");
    const lowerPassword = parsed.data.password.toLowerCase();
    if ((localPart && lowerPassword.includes(localPart)) || (domain && lowerPassword.includes(domain))) {
      return jsonError("The password must not contain the mailbox name or domain.", 422);
    }

    const operational = await getEmailOperationalState();
    if (!operational.verified) return jsonError(operational.reason || "Business email provider is unavailable.", 503);
    await getEmailProvider().changePassword(service.provider_resource_id, parsed.data.password);

    const metadata = service.metadata && typeof service.metadata === "object" && !Array.isArray(service.metadata)
      ? service.metadata as Record<string, unknown>
      : {};
    await prisma.$executeRaw`
      UPDATE "product_service_instances" SET "metadata"=${JSON.stringify({ ...metadata, passwordResetRequired: false })}::jsonb,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}
    `;
    await logAudit({ actorId: user.id, action: "email.password_changed", resource: "email_service", resourceId: service.id });
    return jsonOk({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
