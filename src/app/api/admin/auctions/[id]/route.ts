import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuctionError, closeAuctionIfExpired } from "@/lib/auctions";
import { cancelAuctionAndRelease } from "@/lib/auction-admin";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("feature") }),
  z.object({ action: z.literal("unfeature") }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = schema.parse(await req.json());
    const { id } = await params;
    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return jsonError("Auction not found.", 404);

    let updated;
    if (input.action === "cancel") {
      const result = await cancelAuctionAndRelease(auction.id, input.reason);
      updated = result.auction;
    } else if (input.action === "close") {
      if (!["LIVE", "SCHEDULED"].includes(auction.status)) return jsonError("This auction cannot be manually closed from its current state.", 409);
      if (auction.endAt > new Date()) await prisma.auction.update({ where: { id: auction.id }, data: { endAt: new Date() } });
      updated = await closeAuctionIfExpired(auction.id);
    } else {
      updated = await prisma.auction.update({ where: { id: auction.id }, data: { isFeatured: input.action === "feature" } });
    }

    await logAudit({ actorId: admin.id, action: `auction.${input.action}`, resource: "auction", resourceId: auction.id, metadata: input.action === "cancel" ? { reason: input.reason } : undefined });
    return jsonOk({ auction: updated });
  } catch (err) {
    if (err instanceof AuctionError) return jsonError(err.message, 409);
    return handleError(err);
  }
}
