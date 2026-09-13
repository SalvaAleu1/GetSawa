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
      include: {
        user: true,
        commissions: {
          where: { status: "APPROVED" },
          include: { order: { include: { payments: { orderBy: { createdAt: "desc" }, take: 5 } } } },
        },
      },
    });
    if (!affiliate) return jsonError("Affiliate not found.", 404);
    if (affiliate.status !== "ACTIVE") return jsonError("Affiliate account is not active.", 409);
    if (!PayPalProvider.isConfigured()) return jsonError("Payouts are not currently available. PayPal is not configured.", 503, { code: "PROVIDER_NOT_CONFIGURED" });

    const valid = affiliate.commissions.filter((commission) => {
      if (!commission.order || !["PAYMENT_CONFIRMED","PROVISIONING","ACTIVE"].includes(commission.order.status)) return false;
      const good = commission.order.payments.some((payment) => ["PAID","PARTIALLY_REFUNDED"].includes(payment.status));
      const blocked = commission.order.payments.some((payment) => ["REFUNDED","DISPUTED"].includes(payment.status));
      return good && !blocked;
    });
    const invalidIds = affiliate.commissions.filter((commission) => !valid.some((candidate) => candidate.id === commission.id)).map((commission) => commission.id);
    if (invalidIds.length) {
      await prisma.commission.updateMany({ where: { id: { in: invalidIds }, status: "APPROVED" }, data: { status: "REVERSED" } });
      await logAudit({ actorId: admin.id, action: "affiliate.commissions_auto_reversed", resource: "affiliate", resourceId: affiliate.id, metadata: { commissionIds: invalidIds } });
    }
    if (valid.length === 0) return jsonError("No approved commissions remain eligible for payout after payment/order revalidation.", 400);

    const recipientEmail = affiliate.payoutEmail || affiliate.user.email;
    const totalCents = valid.reduce((sum, commission) => sum + commission.amountCents, 0);
    const batchId = crypto.randomUUID();
    const payout = await prisma.payout.create({ data: { affiliateId: affiliate.id, amountCents: totalCents, status: "PENDING", providerBatchId: batchId } });

    try {
      const providerResult = await PayPalProvider.createPayout({ senderBatchId: batchId, recipientEmail, amountCents: totalCents, currency: "USD", note: "GetSawa affiliate commission payout" });
      const providerBatchId = typeof providerResult?.batch_header?.payout_batch_id === "string" ? providerResult.batch_header.payout_batch_id : batchId;
      await prisma.$transaction([
        prisma.payout.update({ where: { id: payout.id }, data: { status: "SENT", providerBatchId } }),
        prisma.commission.updateMany({ where: { id: { in: valid.map((commission) => commission.id) }, status: "APPROVED" }, data: { status: "PAID", payoutId: payout.id } }),
      ]);
    } catch (error: any) {
      await prisma.payout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: String(error?.message || "PayPal payout failed").slice(0, 500) } });
      throw error;
    }

    await logAudit({ actorId: admin.id, action: "affiliate.payout_sent", resource: "affiliate", resourceId: affiliate.id, metadata: { amountCents: totalCents, commissionIds: valid.map((commission) => commission.id) } });
    return jsonOk({ success: true, amountCents: totalCents, commissionsPaid: valid.length });
  } catch (error) { return handleError(error); }
}
