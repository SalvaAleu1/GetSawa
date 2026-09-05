import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get("limit") || "50");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
    const cursor = searchParams.get("cursor") || undefined;
    const status = searchParams.get("status") || undefined;
    const q = searchParams.get("q")?.trim() || undefined;

    if (status && !ALLOWED_STATUSES.has(status)) {
      return jsonOk({ error: "Invalid order status." }, 422);
    }

    const where = {
      userId: user.id,
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" as const } },
              { items: { some: { description: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = orders.length > limit;
    const page = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return jsonOk({ orders: page, nextCursor });
  } catch (err) {
    return handleError(err);
  }
}
