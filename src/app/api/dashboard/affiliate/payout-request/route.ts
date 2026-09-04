import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

const HOLD_PERIOD_DAYS = 14; // matches spec's "reward delay" — guards against refund reversal

export async function POST() {
  try {
    const user = await requireUser();
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: user.id } });
    if (!affiliate) return jsonError("You are not enrolled in the affiliate program.", 404);

    const eligibleCutoff = new Date(Date.now() - HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.commission.updateMany({
      where: { affiliateId: affiliate.id, status: "PENDING", createdAt: { lte: eligibleCutoff } },
      data: { status: "APPROVED" },
    });

    return jsonOk({
      approvedCount: result.count,
      message:
        result.count > 0
          ? `${result.count} commission(s) approved for payout. An administrator will process the payment.`
          : `No commissions are eligible yet — commissions become eligible for payout ${HOLD_PERIOD_DAYS} days after the order.`,
    });
  } catch (err) {
    return handleError(err);
  }
}
