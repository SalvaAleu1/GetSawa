import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  retailPriceCents: z.number().int().min(0).optional(),
  renewalPriceCents: z.number().int().min(0).nullable().optional(),
  setupFeeCents: z.number().int().min(0).optional(),
  billingCycle: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).optional(),
  providerName: z.string().nullable().optional(),
  provisioningMethod: z.string().nullable().optional(),
  isFeatured: z.boolean().optional(),
  isPromotionEligible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const statusSchema = z.object({
  status: z.enum(["DRAFT", "CONFIGURED", "READY", "ACTIVE", "PAUSED", "DISABLED"]),
});

function providerIsConfigured(providerName: string | null): boolean {
  if (!providerName) return true; // no provider dependency declared
  switch (providerName) {
    case "namesilo":
      return getDomainProvider().isConfigured();
    case "paypal":
      return PayPalProvider.isConfigured();
    case "hosting":
      return Boolean(process.env.HOSTING_API_KEY);
    case "email":
      return Boolean(process.env.EMAIL_PROVIDER_API_KEY);
    case "ai":
      return Boolean(process.env.AI_API_KEY);
    default:
      return false;
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const product = await prisma.product.findUnique({ where: { id: params.id } });
    if (!product) return jsonError("Product not found.", 404);
    return jsonOk({ product, providerConfigured: providerIsConfigured(product.providerName) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const body = await req.json();

    if (body.status) {
      const { status } = statusSchema.parse(body);
      const product = await prisma.product.findUnique({ where: { id: params.id } });
      if (!product) return jsonError("Product not found.", 404);

      if (status === "ACTIVE" && !providerIsConfigured(product.providerName)) {
        return jsonError(
          `This product cannot be activated because its provider ("${product.providerName}") is not configured yet. Configure it under Admin → Providers first.`,
          409,
          { code: "PROVIDER_NOT_CONFIGURED" }
        );
      }

      const updated = await prisma.product.update({
        where: { id: params.id },
        data: { status: status === "ACTIVE" && !providerIsConfigured(product.providerName) ? "PROVIDER_ERROR" : status },
      });

      await logAudit({ actorId: admin.id, action: "product.status_changed", resource: "product", resourceId: product.id, metadata: { from: product.status, to: status } });
      return jsonOk({ product: updated });
    }

    const input = updateSchema.parse(body);
    const product = await prisma.product.update({ where: { id: params.id }, data: input });
    await logAudit({ actorId: admin.id, action: "product.updated", resource: "product", resourceId: product.id });
    return jsonOk({ product });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]);
    const usedInOrders = await prisma.orderItem.count({ where: { productId: params.id } });
    if (usedInOrders > 0) {
      await prisma.product.update({ where: { id: params.id }, data: { status: "DISABLED" } });
      return jsonOk({ success: true, disabledInstead: true });
    }
    await prisma.product.delete({ where: { id: params.id } });
    await logAudit({ actorId: admin.id, action: "product.deleted", resource: "product", resourceId: params.id });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
