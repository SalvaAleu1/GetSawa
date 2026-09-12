import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getProductAdminState, upsertProductCommerceMeta } from "@/lib/product-admin";

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

const createSchema = z.object({
  sku: z.string().min(2).max(64).transform((value) => value.trim().toUpperCase()),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum([
    "DOMAIN_REGISTRATION", "DOMAIN_TRANSFER", "DOMAIN_RENEWAL", "PREMIUM_DOMAIN",
    "HOSTING", "EMAIL", "WEBSITE", "SECURITY", "AI", "MARKETING", "ADD_ON",
  ]),
  imageUrl: z.string().url().optional(),
  retailPriceCents: z.number().int().min(0),
  renewalPriceCents: z.number().int().min(0).optional(),
  setupFeeCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD").transform((value) => value.toUpperCase()),
  billingCycle: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).default("ONE_TIME"),
  providerName: z.string().max(100).optional(),
  providerProductId: z.string().max(200).optional(),
  provisioningMethod: z.string().max(100).optional(),
  isFeatured: z.boolean().default(false),
  isPromotionEligible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  commerce: commerceSchema,
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const products = await prisma.product.findMany({
      where: {
        category: category ? (category as any) : undefined,
        status: status ? (status as any) : undefined,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    const states = await Promise.all(products.map(getProductAdminState));
    return jsonOk({
      products: states.map(({ product, commerce, readiness, activationReadiness }) => ({
        ...product,
        commerce,
        readiness,
        activationReadiness,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());
    const { commerce, ...productData } = input;

    // New products always start off-sale. Provider, cost, fulfilment and billing
    // readiness must all be proven before ACTIVE can be selected.
    const product = await prisma.product.create({ data: { ...productData, status: "DRAFT" } });
    await upsertProductCommerceMeta(product.id, commerce ?? {});
    const state = await getProductAdminState(product);

    await logAudit({
      actorId: admin.id,
      action: "product.created",
      resource: "product",
      resourceId: product.id,
      metadata: { sku: product.sku, category: product.category },
    });
    return jsonOk(state, 201);
  } catch (err) {
    return handleError(err);
  }
}
