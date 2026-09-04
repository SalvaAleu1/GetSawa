import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  domainName: z.string().min(3).max(253).transform((s) => s.toLowerCase()),
  purchasePriceCents: z.number().int().min(0),
  renewalPriceCents: z.number().int().min(0),
  category: z.string().max(100).optional(),
  isFeatured: z.boolean().default(false),
});

export async function GET() {
  try {
    await requireAdmin();
    const listings = await prisma.premiumDomain.findMany({ orderBy: { createdAt: "desc" } });
    return jsonOk({ listings });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());
    const ext = input.domainName.split(".").slice(1).join(".");
    const tld = await prisma.tld.findUnique({ where: { extension: ext } });
    if (!tld) return jsonError(`.${ext} is not a configured TLD — add it in the TLD Manager first.`, 400);

    const listing = await prisma.premiumDomain.create({
      data: { ...input, tldId: tld.id, status: "LISTED" },
    });

    await logAudit({ actorId: admin.id, action: "premium_domain.created", resource: "premium_domain", resourceId: listing.id });
    return jsonOk({ listing }, 201);
  } catch (err) {
    return handleError(err);
  }
}
