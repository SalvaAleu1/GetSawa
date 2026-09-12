import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getBundleReadiness } from "@/lib/bundle-readiness";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  productSkus: z.array(z.string().min(2).max(64)).min(2).max(20),
  bundlePriceCents: z.number().int().min(1),
  renewalPriceCents: z.number().int().min(0).nullable().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const bundles = await prisma.bundle.findMany({ orderBy: { createdAt: "desc" } });
    const results = await Promise.all(bundles.map(async (bundle) => ({ bundle, readiness: await getBundleReadiness(bundle) })));
    return jsonOk({ bundles: results });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());
    const productSkus = [...new Set(input.productSkus.map((sku) => sku.trim().toUpperCase()))];
    const bundle = await prisma.bundle.create({
      data: {
        name: input.name,
        description: input.description,
        productSkus,
        bundlePriceCents: input.bundlePriceCents,
        renewalPriceCents: input.renewalPriceCents ?? null,
        isActive: false,
      },
    });
    const readiness = await getBundleReadiness(bundle);
    await logAudit({ actorId: admin.id, action: "bundle.created", resource: "bundle", resourceId: bundle.id, metadata: { productSkus } });
    return jsonOk({ bundle, readiness }, 201);
  } catch (error) {
    return handleError(error);
  }
}
