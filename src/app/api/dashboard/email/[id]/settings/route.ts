import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  aliases: z.array(z.string().trim().min(1).max(254)).max(50).optional(),
  forwardRecipients: z.array(z.string().trim().email().max(254)).max(10).optional(),
});
type RouteContext = { params: Promise<{ id: string }> };

function normalizeAlias(value: string, domain: string) {
  const raw = value.trim().toLowerCase();
  const full = raw.includes("@") ? raw : `${raw}@${domain}`;
  if (!/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]?@[a-z0-9.-]+\.[a-z]{2,}$/i.test(full)) throw new Error(`Invalid alias: ${value}`);
  const [, aliasDomain] = full.split("@");
  if (aliasDomain !== domain) throw new Error("Aliases must use the same managed email domain as the mailbox.");
  return full;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Invalid mailbox settings.", 422, { issues: parsed.error.issues });
    if (parsed.data.aliases === undefined && parsed.data.forwardRecipients === undefined) return jsonError("No mailbox settings were supplied.", 422);

    const rows = await prisma.$queryRaw<Array<{ id: string; provider_resource_id: string; status: string }>>`
      SELECT "id","provider_resource_id","status" FROM "product_service_instances"
      WHERE "id"=${id} AND "user_id"=${user.id} AND "provider_name"='opensrs_hosted_email' LIMIT 1
    `;
    const service = rows[0];
    if (!service) return jsonError("Mailbox service not found.", 404);
    if (service.status !== "ACTIVE") return jsonError("Mailbox settings can only be changed while the service is active.", 409);
    const domain = service.provider_resource_id.toLowerCase().split("@")[1];
    if (!domain) return jsonError("Mailbox provider reference is invalid.", 500);

    const aliases = parsed.data.aliases?.map((value) => normalizeAlias(value, domain));
    const forwards = parsed.data.forwardRecipients?.map((value) => value.toLowerCase());
    if (aliases && new Set(aliases).size !== aliases.length) return jsonError("Duplicate aliases are not allowed.", 422);
    if (forwards && new Set(forwards).size !== forwards.length) return jsonError("Duplicate forwarding recipients are not allowed.", 422);

    const operational = await getEmailOperationalState();
    if (!operational.verified) return jsonError(operational.reason || "Business email provider is unavailable.", 503);
    const provider = getEmailProvider();
    await provider.updateMailbox(service.provider_resource_id, { aliases, forwardRecipients: forwards });
    const live = await provider.getMailbox(service.provider_resource_id);
    await logAudit({
      actorId: user.id,
      action: "email.settings_changed",
      resource: "email_service",
      resourceId: service.id,
      metadata: { aliasCount: aliases?.length, forwardRecipientCount: forwards?.length },
    });
    return jsonOk({
      success: true,
      mailbox: live,
      forwardingConfirmationRequired: forwards !== undefined && forwards.length > 0,
      message: forwards !== undefined && forwards.length > 0
        ? "OpenSRS accepted the forwarding recipients. Each recipient must complete the provider's opt-in confirmation before external forwarding is treated as active."
        : "Mailbox settings updated.",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid alias:")) return jsonError(error.message, 422);
    if (error instanceof Error && error.message.includes("Aliases must use")) return jsonError(error.message, 422);
    return handleError(error);
  }
}
