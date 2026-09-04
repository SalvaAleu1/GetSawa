import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const key = await prisma.apiClient.findUnique({ where: { id: params.id } });
    if (!key || key.userId !== user.id) return jsonError("API key not found.", 404);

    await prisma.apiClient.update({ where: { id: key.id }, data: { isActive: false } });
    await logAudit({ actorId: user.id, action: "api_key.revoked", resource: "api_client", resourceId: key.id });

    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
