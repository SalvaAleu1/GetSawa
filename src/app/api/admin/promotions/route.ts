import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const conditionSchema = z.object({
  field: z.enum(["customer.isNew", "cart.hasSku", "cart.hasTld", "cart.hasKind", "cart.minSubtotalCents"]),
  op: z.enum(["eq", "in", "gte", "lte"]),
  value: z.any(),
});

const effectSchema = z.object({
  type: z.enum(["FREE_ITEM", "PERCENT_OFF_ITEM", "FIXED_OFF_ITEM"]),
  targetKind: z.enum(["DOMAIN_REGISTRATION", "DOMAIN_RENEWAL", "DOMAIN_TRANSFER", "PRODUCT"]).optional(),
  targetTlds: z.array(z.string()).optional(),
  targetSkus: z.array(z.string()).optional(),
  excludePremium: z.boolean().optional(),
  maxQuantity: z.number().int().min(1).optional(),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(false),
  rules: z.object({
    conditionLogic: z.enum(["AND", "OR"]).default("AND"),
    conditions: z.array(conditionSchema).default([]),
    effects: z.array(effectSchema).min(1),
  }),
  priority: z.number().int().default(0),
  isStackable: z.boolean().default(false),
  isExclusive: z.boolean().default(false),
  maxDiscountCents: z.number().int().min(0).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const promotions = await prisma.promotion.findMany({ orderBy: { priority: "desc" } });
    return jsonOk({ promotions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());

    const promotion = await prisma.promotion.create({
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive,
        rules: input.rules as any,
        priority: input.priority,
        isStackable: input.isStackable,
        isExclusive: input.isExclusive,
        maxDiscountCents: input.maxDiscountCents,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      },
    });

    await logAudit({ actorId: admin.id, action: "promotion.created", resource: "promotion", resourceId: promotion.id });
    return jsonOk({ promotion }, 201);
  } catch (err) {
    return handleError(err);
  }
}
