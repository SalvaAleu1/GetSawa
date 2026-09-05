import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionOrder } from "@/lib/provisioning";
import { logAudit } from "@/lib/audit";
import { handleError } from "@/lib/api";
import { transitionOrderStatus } from "@/lib/order-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const { id } = await params;

    const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payments: true } });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (!["PAYMENT_CONFIRMED", "PROVISIONING", "FAILED"].includes(order.status)) {
      return NextResponse.json({ error: "Only paid fulfilment orders can be retried." }, { status: 409 });
    }
    if (!order.payments.some((payment) => payment.status === "PAID")) {
      return NextResponse.json({ error: "A confirmed payment is required before fulfilment can be retried." }, { status: 409 });
    }

    const retryable = order.items.filter((item) => item.provisioningStatus === "FAILED" || item.provisioningStatus === "PROVISIONING");
    if (retryable.length === 0) return NextResponse.json({ error: "There are no failed or recoverable provisioning items to retry." }, { status: 409 });

    await transitionOrderStatus({
      orderId: order.id,
      to: "PROVISIONING",
      actorId: admin.id,
      reason: "Administrator requested fulfilment recovery.",
      metadata: { retryItemIds: retryable.map((item) => item.id) },
    });

    await prisma.order.update({ where: { id: order.id }, data: { provisioningError: null } });

    await logAudit({
      actorId: admin.id,
      action: "PROVISIONING_RETRY_REQUESTED",
      resource: "order",
      resourceId: order.id,
      metadata: { retryItemIds: retryable.map((item) => item.id) },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") || undefined,
    });

    await provisionOrder(order.id);

    const refreshed = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
    return NextResponse.json({ ok: true, order: refreshed });
  } catch (error) {
    return handleError(error);
  }
}
