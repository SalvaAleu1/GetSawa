import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { assertProductCanActivate, getProductAdminState, upsertProductCommerceMeta } from "@/lib/product-admin";

const commerceSchema = z.object({
  wholesaleCostCents: z.number().int().min(0).nullable().optional(),
  wholesaleCurrency: z.string().length(3).optional(),
  costSource: z.enum(["UNKNOWN", "MANUAL_VERIFIED", "PROVIDER_SYNC", "INTERNAL_VERIFIED"]).optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
  requiresDomain: z.boolean().optional(),
  configurationSchema: z.record(z.string(), z.unknown()).optional(),
  provisioningContract: z.string().max(100).nullable().optional(),
  renewalContract: z.string().max(100).nullable().optional(),
}).optional();

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  retailPriceCents: z.number().int().min(0).optional(),
  renewalPriceCents: z.number().int().min(0).nullable().optional(),
  setupFeeCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).optional(),
  billingCycle: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).optional(),
  providerName: z.string().max(100).nullable().optional(),
  providerProductId: z.string().max(200).nullable().optional(),
  provisioningMethod: z.string().max(100).nullable().optional(),
  isFeatured: z.boolean().optional(),
  isPromotionEligible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(["DRAFT", "CONFIGURED", "READY", "ACTIVE", "PAUSED", "DISABLED"]).optional(),
  commerce: commerceSchema,
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return jsonError("Product not found.", 404);
    return jsonOk(await getProductAdminState(product));
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const { id } = await params;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return jsonError("Product not found.", 404);

    const input = updateSchema.parse(await req.json());
    const { commerce, status, ...updates } = input;
    let product = Object.keys(updates).length > 0
      ? await prisma.product.update({ where: { id }, data: updates })
      : existing;

    if (commerce) await upsertProductCommerceMeta(product.id, commerce);

    if (status === "ACTIVE") {
      try {
        await assertProductCanActivate(product);
      } catch (error) {
        const reasons = error instanceof Error && "reasons" in error
          ? (error as Error & { reasons?: string[] }).reasons
          : undefined;
        return jsonError(error instanceof Error ? error.message : "Product is not ready for activation.", 409, {
          code: "PRODUCT_NOT_READY",
          reasons: reasons ?? [],
        });
      }
    }

    if (status && status !== product.status) {
      const previousStatus = product.status;
      product = await prisma.product.update({ where: { id }, data: { status } });
      await logAudit({
        actorId: admin.id,
        action: "product.status_changed",
        resource: "product",
        resourceId: product.id,
        metadata: { from: previousStatus, to: status },
      });
    } else if (Object.keys(updates).length > 0 || commerce) {
      await logAudit({ actorId: admin.id, action: "product.updated", resource: "product", resourceId: product.id });
    }

    return jsonOk(await getProductAdminState(product));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]);
    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return jsonError("Product not found.", 404);
    const usedInOrders = await prisma.orderItem.count({ where: { productId: id } });
    if (usedInOrders > 0) {
      const disabled = await prisma.product.update({ where: { id }, data: { status: "DISABLED" } });
      await logAudit({ actorId: admin.id, action: "product.disabled", resource: "product", resourceId: id, metadata: { reason: "order_history" } });
      return jsonOk({ success: true, disabledInstead: true, product: disabled });
    }
    await prisma.product.delete({ where: { id } });
    await logAudit({ actorId: admin.id, action: "product.deleted", resource: "product", resourceId: id });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
