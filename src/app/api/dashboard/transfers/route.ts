import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const transfers = await prisma.domainTransfer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        domainId: true,
        domainName: true,
        status: true,
        failureReason: true,
        providerTransferId: true,
        createdAt: true,
        updatedAt: true,
        orderItems: {
          select: { order: { select: { orderNumber: true, status: true, totalCents: true, currency: true, createdAt: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const now = Date.now();
    const enriched = transfers.map((transfer) => ({
      ...transfer,
      ageDays: Math.max(0, Math.floor((now - transfer.createdAt.getTime()) / 86_400_000)),
      actionRequired: actionRequired(transfer.status, transfer.failureReason),
      order: transfer.orderItems[0]?.order ?? null,
      orderItems: undefined,
    }));

    return jsonOk({
      transfers: enriched,
      stats: {
        total: transfers.length,
        active: transfers.filter((transfer) => ["SUBMITTED", "PENDING_AUTH", "IN_PROGRESS"].includes(transfer.status)).length,
        attention: transfers.filter((transfer) => ["FAILED", "PENDING_AUTH"].includes(transfer.status)).length,
        completed: transfers.filter((transfer) => transfer.status === "COMPLETED").length,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

function actionRequired(status: string, failureReason: string | null) {
  if (status === "AWAITING_PAYMENT") return "Complete payment to submit the transfer.";
  if (status === "PENDING_AUTH") return "Check the registrant/admin email and confirm the transfer request.";
  if (status === "FAILED") return failureReason || "Review the EPP code, lock state and registrar message before retrying.";
  if (status === "IN_PROGRESS" || status === "SUBMITTED") return "No action is normally required unless the registrar requests it.";
  return null;
}
