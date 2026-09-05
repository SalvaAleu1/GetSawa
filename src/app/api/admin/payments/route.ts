import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        order: { select: { id: true, orderNumber: true, totalCents: true, currency: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        refunds: { orderBy: { createdAt: "desc" } },
      },
    });
    return jsonOk({ payments });
  } catch (error) {
    return handleError(error);
  }
}
