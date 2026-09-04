import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
      include: {
        commissions: { orderBy: { createdAt: "desc" }, take: 50 },
        payouts: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { clicks: true } },
      },
    });

    if (!affiliate) {
      return jsonOk({ enrolled: false, referralCode: user.referralCode });
    }

    const totals = {
      totalCommissionCents: affiliate.commissions.reduce((s, c) => s + c.amountCents, 0),
      pendingCommissionCents: affiliate.commissions.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0),
      approvedCommissionCents: affiliate.commissions.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.amountCents, 0),
      paidCommissionCents: affiliate.commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0),
    };

    return jsonOk({
      enrolled: true,
      referralCode: user.referralCode,
      commissionPercent: affiliate.commissionPercent,
      clicks: affiliate._count.clicks,
      commissions: affiliate.commissions,
      payouts: affiliate.payouts,
      totals,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    const affiliate = await prisma.affiliate.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    return jsonOk({ affiliate });
  } catch (err) {
    return handleError(err);
  }
}
