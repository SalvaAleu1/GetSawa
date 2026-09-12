import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { assertBundleCanActivate, getBundleReadiness } from "@/lib/bundle-readiness";

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  productSkus: z.array(z.string().min(2).max(64)).min(2).max(20).optional(),
  bundlePriceCents: z.number().int().min(1).optional(),
  renewalPriceCents: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await params;
    const bundle = await prisma.bundle.findUnique({ where: { id } });
    if (!bundle) return jsonError("Bundle not found.", 404);
    return jsonOk({ bundle, readiness: await getBundleReadiness(bundle) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const { id } = await params;
    const existing = await prisma.bundle.findUnique({ where: { id } });
    if (!existing) return jsonError("Bundle not found.", 404);
    const input = updateSchema.parse(await req.json());
    const productSkus = input.productSkus ? [...new Set(input.productSkus.map((sku) => sku.trim().toUpperCase()))] : undefined;
    const candidate = { ...existing, ...input, ...(productSkus ? { productSkus } : {}) };

    if (input.isActive === true) {
      try {
        await assertBundleCanActivate(candidate);
      } catch (error) {
        const reasons = error instanceof Error && "reasons" in error
          ? (error as Error & { reasons?: string[] }).reasons
          : undefined;
        return jsonError(error instanceof Error ? error.message : "Bundle is not ready for activation.", 409, {
          code: "BUNDLE_NOT_READY",
          reasons: reasons ?? [],
        });
      }
    }

    const bundle = await prisma.bundle.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        productSkus,
        bundlePriceCents: input.bundlePriceCents,
        renewalPriceCents: input.renewalPriceCents,
        isActive: input.isActive,
      },
    });
    await logAudit({ actorId: admin.id, action: "bundle.updated", resource: "bundle", resourceId: bundle.id, metadata: { active: bundle.isActive } });
    return jsonOk({ bundle, readiness: await getBundleReadiness(bundle) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]);
    const { id } = await params;
    const bundle = await prisma.bundle.findUnique({ where: { id } });
    if (!bundle) return jsonError("Bundle not found.", 404);
    if (bundle.isActive) {
      await prisma.bundle.update({ where: { id }, data: { isActive: false } });
      await logAudit({ actorId: admin.id, action: "bundle.deactivated", resource: "bundle", resourceId: id });
      return jsonOk({ success: true, deactivatedInstead: true });
    }
    await prisma.bundle.delete({ where: { id } });
    await logAudit({ actorId: admin.id, action: "bundle.deleted", resource: "bundle", resourceId: id });
    return jsonOk({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
