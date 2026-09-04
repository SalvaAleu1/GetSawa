import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    const affiliates = await prisma.affiliate.findMany({
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        commissions: true,
        _count: { select: { clicks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({
      affiliates: affiliates.map((a) => ({
        id: a.id,
        user: a.user,
        status: a.status,
        commissionPercent: a.commissionPercent,
        clicks: a._count.clicks,
        approvedUnpaidCents: a.commissions.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.amountCents, 0),
        totalPaidCents: a.commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
