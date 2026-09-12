import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import {
  getPricingSafetyPolicy,
  savePricingSafetyPolicy,
} from "@/lib/pricing-policy";

const tierSchema = z.object({
  minWholesaleCents: z.number().int().min(0),
  maxWholesaleCents: z.number().int().min(0).nullable(),
  markupPercent: z.number().min(0).max(1000),
  minimumMarkupCents: z.number().int().min(0),
});

const policySchema = z.object({
  paymentFeePercent: z.number().min(0).lt(100),
  paymentFixedFeeCents: z.number().int().min(0),
  fxBufferPercent: z.number().min(0).lt(100),
  minimumProfitCents: z.number().int().min(0),
  minimumMarginPercent: z.number().min(0).lt(100),
  markupTiers: z.array(tierSchema).min(1).max(30),
});

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    return jsonOk({ policy: await getPricingSafetyPolicy() });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = policySchema.parse(await req.json());
    const policy = await savePricingSafetyPolicy(input);
    await logAudit({
      actorId: admin.id,
      action: "pricing_policy.updated",
      resource: "system_setting",
      resourceId: "commerce.pricing_policy",
      metadata: { policy },
    });
    return jsonOk({ policy });
  } catch (err) {
    return handleError(err);
  }
}
