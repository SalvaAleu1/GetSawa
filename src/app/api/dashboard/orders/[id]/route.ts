import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: { id, userId: user.id },
      include: {
        items: true,
        invoice: true,
        payments: {
          select: {
            id: true,
            provider: true,
            amountCents: true,
            currency: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) return jsonOk({ error: "Order not found." }, { status: 404 });

    return jsonOk({ order });
  } catch (err) {
    return handleError(err);
  }
}
