import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionOrder } from "@/lib/provisioning";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (!["PAYMENT_CONFIRMED", "PROVISIONING"].includes(order.status)) {
      return NextResponse.json({ error: "Only paid/provisioning orders can be retried." }, { status: 409 });
    }

    const retryable = order.items.filter((item) => item.provisioningStatus === "FAILED");
    if (retryable.length === 0) {
      return NextResponse.json({ error: "There are no failed provisioning items to retry." }, { status: 409 });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "PROVISIONING", provisioningError: null },
    });

    await logAudit({
      actorId: admin.id,
      action: "PROVISIONING_RETRY_REQUESTED",
      resource: "order",
      resourceId: order.id,
      metadata: { failedItemIds: retryable.map((item) => item.id) },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") || undefined,
    });

    await provisionOrder(order.id);

    const refreshed = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });

    return NextResponse.json({
      ok: true,
      order: refreshed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry provisioning.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
