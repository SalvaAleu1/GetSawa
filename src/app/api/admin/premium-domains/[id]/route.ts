import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  purchasePriceCents: z.number().int().min(0).optional(),
  renewalPriceCents: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(["LISTED", "DELISTED"]).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = schema.parse(await req.json());
    const listing = await prisma.premiumDomain.update({ where: { id: params.id }, data: input });
    await logAudit({ actorId: admin.id, action: "premium_domain.updated", resource: "premium_domain", resourceId: listing.id });
    return jsonOk({ listing });
  } catch (err) {
    return handleError(err);
  }
}
