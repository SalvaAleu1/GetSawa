import { NextRequest } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE"]);
    const { id } = await params;
    const affiliate = await prisma.affiliate.findUnique({
      where: { id },
      include: { user: true, commissions: { where: { status: "APPROVED" } } },
    });
    if (!affiliate) return jsonError("Affiliate not found.", 404);
    if (affiliate.commissions.length === 0) return jsonError("No approved commissions to pay out.", 400);

    if (!PayPalProvider.isConfigured()) {
      return jsonError("Payouts are not currently available. PayPal is not configured.", 503, { code: "PROVIDER_NOT_CONFIGURED" });
    }

    const recipientEmail = affiliate.payoutEmail || affiliate.user.email;
    const totalCents = affiliate.commissions.reduce((s, c) => s + c.amountCents, 0);
    const batchId = crypto.randomUUID();

    const payout = await prisma.payout.create({
      data: { affiliateId: affiliate.id, amountCents: totalCents, status: "PENDING", providerBatchId: batchId },
    });

    try {
      await PayPalProvider.createPayout({
        senderBatchId: batchId,
        recipientEmail,
        amountCents: totalCents,
        currency: "USD",
        note: "GetSawa affiliate commission payout",
      });

      await prisma.$transaction([
        prisma.payout.update({ where: { id: payout.id }, data: { status: "SENT" } }),
        prisma.commission.updateMany({
          where: { id: { in: affiliate.commissions.map((c) => c.id) } },
          data: { status: "PAID", payoutId: payout.id },
        }),
      ]);
    } catch (err: any) {
      await prisma.payout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: err.message } });
      throw err;
    }

    await logAudit({ actorId: admin.id, action: "affiliate.payout_sent", resource: "affiliate", resourceId: affiliate.id, metadata: { amountCents: totalCents } });

    return jsonOk({ success: true, amountCents: totalCents });
  } catch (err) {
    return handleError(err);
  }
}
