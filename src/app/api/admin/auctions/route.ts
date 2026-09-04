import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  domainName: z.string().min(3).max(253),
  startingBidCents: z.number().int().min(0),
  reservePriceCents: z.number().int().min(0).optional(),
  minIncrementCents: z.number().int().min(1).default(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isFeatured: z.boolean().default(false),
});

export async function GET() {
  try {
    await requireAdmin();
    const auctions = await prisma.auction.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { bids: true } } },
    });
    return jsonOk({ auctions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());

    const auction = await prisma.auction.create({
      data: {
        ...input,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        status: new Date(input.startAt) <= new Date() ? "LIVE" : "SCHEDULED",
      },
    });

    await logAudit({ actorId: admin.id, action: "auction.created", resource: "auction", resourceId: auction.id });
    return jsonOk({ auction }, 201);
  } catch (err) {
    return handleError(err);
  }
}
