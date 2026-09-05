import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { computeTldPrice } from "@/lib/pricing";

const updateSchema = z.object({
  isActive: z.boolean().optional(), isFeatured: z.boolean().optional(), supportsPrivacy: z.boolean().optional(), supportsPremium: z.boolean().optional(),
  minYears: z.number().int().min(1).max(10).optional(), maxYears: z.number().int().min(1).max(10).optional(),
  pricingMethod: z.enum(["FIXED", "WHOLESALE_PLUS_FIXED", "WHOLESALE_PLUS_PERCENT", "CUSTOM"]).optional(),
  wholesaleRegisterCents: z.number().int().min(0).nullable().optional(), wholesaleRenewCents: z.number().int().min(0).nullable().optional(), wholesaleTransferCents: z.number().int().min(0).nullable().optional(),
  fixedRegisterCents: z.number().int().min(0).nullable().optional(), fixedRenewCents: z.number().int().min(0).nullable().optional(), fixedTransferCents: z.number().int().min(0).nullable().optional(),
  markupFixedCents: z.number().int().min(0).nullable().optional(), markupPercent: z.number().min(0).max(1000).nullable().optional(), currency: z.string().length(3).optional(), promotionEligible: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try { await requireAdmin(); const { id } = await params; const tld = await prisma.tld.findUnique({ where: { id } }); if (!tld) return jsonError("TLD not found.", 404); return jsonOk({ tld, computedPrice: computeTldPrice(tld) }); }
  catch (err) { return handleError(err); }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]); const { id } = await params; const input = updateSchema.parse(await req.json());
    const existing = await prisma.tld.findUnique({ where: { id } }); if (!existing) return jsonError("TLD not found.", 404);
    const tld = await prisma.tld.update({ where: { id }, data: input });
    await logAudit({ actorId: admin.id, action: "tld.updated", resource: "tld", resourceId: tld.id, metadata: { before: existing, changes: input } });
    return jsonOk({ tld, computedPrice: computeTldPrice(tld) });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]); const { id } = await params; const domainCount = await prisma.domain.count({ where: { tldId: id } });
    if (domainCount > 0) return jsonError("This TLD has active domains registered against it and cannot be deleted. Deactivate it instead.", 409);
    await prisma.tld.delete({ where: { id } }); await logAudit({ actorId: admin.id, action: "tld.deleted", resource: "tld", resourceId: id }); return jsonOk({ success: true });
  } catch (err) { return handleError(err); }
}
