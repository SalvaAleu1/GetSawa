import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  sku: z.string().min(2).max(64),
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
  currency: z.string().length(3).default("USD"),
  billingCycle: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).default("ONE_TIME"),
  providerName: z.string().optional(),
  providerProductId: z.string().optional(),
  provisioningMethod: z.string().optional(),
  isFeatured: z.boolean().default(false),
  isPromotionEligible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
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
    return jsonOk({ products });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());

    // A product must start in DRAFT — spec section 150: it can only become
    // ACTIVE (and therefore purchasable) once an admin explicitly activates
    // it, which the PATCH /status endpoint enforces against dependency
    // checks (provider configured, pricing set, etc).
    const product = await prisma.product.create({ data: { ...input, status: "DRAFT" } });

    await logAudit({ actorId: admin.id, action: "product.created", resource: "product", resourceId: product.id });
    return jsonOk({ product }, 201);
  } catch (err) {
    return handleError(err);
  }
}
