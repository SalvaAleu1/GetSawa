import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ enabled: z.boolean() });
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { enabled } = schema.parse(await req.json());

    const rows = await prisma.$queryRaw<Array<{ service_id: string; subscription_id: string | null; subscription_status: string | null; current_period_end: Date | null }>>`
      SELECT psi."id" AS service_id,bs."id" AS subscription_id,bs."status" AS subscription_status,bs."current_period_end"
      FROM "product_service_instances" psi
      LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id"
      WHERE psi."id"=${id} AND psi."user_id"=${user.id} AND psi."provider_name"='cpanel_whm' LIMIT 1
    `;
    const row = rows[0];
    if (!row) return jsonError("Hosting service not found.", 404);
    if (!row.subscription_id) return jsonError("This hosting service does not have recurring billing.", 409);
    if (["EXPIRED", "CANCELLED"].includes(row.subscription_status || "")) {
      return jsonError("This subscription has already ended. Contact support if you want to reactivate the hosting service.", 409);
    }

    await prisma.$executeRaw`
      UPDATE "billing_subscriptions" SET
        "auto_renew"=${enabled},
        "cancel_at_period_end"=${!enabled},
        "updated_at"=CURRENT_TIMESTAMP
      WHERE "id"=${row.subscription_id} AND "user_id"=${user.id}
    `;
    await logAudit({
      actorId: user.id,
      action: enabled ? "hosting.autorenew.enabled" : "hosting.autorenew.disabled",
      resource: "hosting_service",
      resourceId: row.service_id,
      metadata: { subscriptionId: row.subscription_id, currentPeriodEnd: row.current_period_end?.toISOString() ?? null },
    });
    return jsonOk({ id: row.service_id, autoRenew: enabled, cancelAtPeriodEnd: !enabled, currentPeriodEnd: row.current_period_end });
  } catch (error) {
    return handleError(error);
  }
}
