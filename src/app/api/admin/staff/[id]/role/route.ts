import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const roleSchema = z.object({ role: z.enum(["SUPER_ADMIN","ADMIN","SUPPORT","FINANCE","CONTENT_MANAGER","PRODUCT_MANAGER"]).nullable() });
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireAdmin(["SUPER_ADMIN"]);
    const { id } = await params;
    const { role } = roleSchema.parse(await req.json());
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, adminRole: true } });
    if (!target) return jsonError("Staff account not found.", 404);
    if (target.id === actor.id && role !== "SUPER_ADMIN") return jsonError("You cannot remove or reduce your own Super Admin role from this session.", 400);
    if (target.adminRole === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
      const superAdmins = await prisma.user.count({ where: { adminRole: "SUPER_ADMIN", isSuspended: false } });
      if (superAdmins <= 1) return jsonError("The last active Super Admin cannot be demoted.", 400);
    }
    const updated = await prisma.user.update({ where: { id }, data: { adminRole: role }, select: { id: true, email: true, firstName: true, lastName: true, adminRole: true, isSuspended: true, mfaEnabled: true } });
    await logAudit({ actorId: actor.id, action: "staff.role_changed", resource: "user", resourceId: id, metadata: { previousRole: target.adminRole, nextRole: role, email: target.email } });
    return jsonOk({ staff: updated });
  } catch (error) { return handleError(error); }
}
