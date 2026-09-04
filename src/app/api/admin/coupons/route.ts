import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  code: z.string().min(3).max(50).transform((s) => s.toUpperCase()),
  discountType: z.enum(["PERCENT", "FIXED", "FREE_PRODUCT"]),
  discountValue: z.number().int().min(0),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  usageLimit: z.number().int().min(1).optional(),
  perCustomerLimit: z.number().int().min(1).default(1),
  minOrderCents: z.number().int().min(0).optional(),
  maxDiscountCents: z.number().int().min(0).optional(),
  newCustomerOnly: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    return jsonOk({ coupons });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER", "FINANCE"]);
    const input = createSchema.parse(await req.json());

    const coupon = await prisma.coupon.create({
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      },
    });

    await logAudit({ actorId: admin.id, action: "coupon.created", resource: "coupon", resourceId: coupon.id });
    return jsonOk({ coupon }, 201);
  } catch (err) {
    return handleError(err);
  }
}
