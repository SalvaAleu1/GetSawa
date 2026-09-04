import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const body = await req.json();
    const existing = await prisma.promotion.findUnique({ where: { id: params.id } });
    if (!existing) return jsonError("Promotion not found.", 404);

    const promotion = await prisma.promotion.update({
      where: { id: params.id },
      data: {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
        rules: body.rules,
        priority: body.priority,
        isStackable: body.isStackable,
        isExclusive: body.isExclusive,
        maxDiscountCents: body.maxDiscountCents,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
      },
    });

    await logAudit({ actorId: admin.id, action: "promotion.updated", resource: "promotion", resourceId: promotion.id });
    return jsonOk({ promotion });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]);
    await prisma.promotion.delete({ where: { id: params.id } });
    await logAudit({ actorId: admin.id, action: "promotion.deleted", resource: "promotion", resourceId: params.id });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
