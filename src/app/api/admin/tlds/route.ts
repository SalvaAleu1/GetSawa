import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { computeProtectedTldPrice } from "@/lib/pricing";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";

const createSchema = z.object({
  extension: z.string().min(1).max(30).transform((s) => s.toLowerCase().replace(/^\./, "")),
  isActive: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  supportsPrivacy: z.boolean().default(false),
  // Fail-safe default: only mark this true after confirming the registry can
  // return premium names and the configured provider can quote them safely.
  supportsPremium: z.boolean().default(false),
  minYears: z.number().int().min(1).max(10).default(1),
  maxYears: z.number().int().min(1).max(10).default(10),
  pricingMethod: z.enum(["FIXED", "WHOLESALE_PLUS_FIXED", "WHOLESALE_PLUS_PERCENT", "CUSTOM"]).default("WHOLESALE_PLUS_PERCENT"),
  wholesaleRegisterCents: z.number().int().min(0).optional(),
  wholesaleRenewCents: z.number().int().min(0).optional(),
  wholesaleTransferCents: z.number().int().min(0).optional(),
  fixedRegisterCents: z.number().int().min(0).optional(),
  fixedRenewCents: z.number().int().min(0).optional(),
  fixedTransferCents: z.number().int().min(0).optional(),
  markupFixedCents: z.number().int().min(0).optional(),
  markupPercent: z.number().min(0).max(1000).optional(),
  currency: z.string().length(3).default("USD"),
  promotionEligible: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    const [tlds, policy] = await Promise.all([
      prisma.tld.findMany({ orderBy: { extension: "asc" } }),
      getPricingSafetyPolicy(),
    ]);
    return jsonOk({
      tlds: tlds.map((t) => ({
        ...t,
        computedPrice: computeProtectedTldPrice(t, policy),
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
    const tld = await prisma.tld.create({ data: input });
    await logAudit({ actorId: admin.id, action: "tld.created", resource: "tld", resourceId: tld.id, metadata: input });
    return jsonOk({ tld }, 201);
  } catch (err) {
    return handleError(err);
  }
}
