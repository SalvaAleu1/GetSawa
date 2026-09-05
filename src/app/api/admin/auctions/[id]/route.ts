import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { closeAuctionIfExpired } from "@/lib/auctions";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "close", "feature", "unfeature"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const { action } = schema.parse(await req.json());
    const { id } = await params;
    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return jsonError("Auction not found.", 404);

    let updated;
    switch (action) {
      case "pause":
        updated = await prisma.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } });
        break;
      case "resume":
        updated = await prisma.auction.update({ where: { id: auction.id }, data: { status: "LIVE" } });
        break;
      case "cancel":
        updated = await prisma.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } });
        break;
      case "close":
        updated = await closeAuctionIfExpired(auction.id);
        if (updated?.status !== "ENDED") {
          updated = await prisma.auction.update({ where: { id: auction.id }, data: { endAt: new Date() } });
          updated = await closeAuctionIfExpired(auction.id);
        }
        break;
      case "feature":
        updated = await prisma.auction.update({ where: { id: auction.id }, data: { isFeatured: true } });
        break;
      case "unfeature":
        updated = await prisma.auction.update({ where: { id: auction.id }, data: { isFeatured: false } });
        break;
    }

    await logAudit({ actorId: admin.id, action: `auction.${action}`, resource: "auction", resourceId: auction.id });
    return jsonOk({ auction: updated });
  } catch (err) {
    return handleError(err);
  }
}
