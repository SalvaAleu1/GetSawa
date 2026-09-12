import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { encryptSecret } from "@/lib/crypto";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CHANGE_EPP"), authCode: z.string().trim().min(1).max(255) }),
  z.object({ action: z.literal("RESEND_EMAIL") }),
  z.object({ action: z.literal("RESUBMIT") }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const transfer = await prisma.domainTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.userId !== user.id) return jsonError("Transfer not found.", 404);
    if (["COMPLETED", "CANCELLED"].includes(transfer.status)) return jsonError("This transfer is already closed.", 409);

    const input = schema.parse(await req.json());
    const provider = getDomainProvider();

    if (input.action === "CHANGE_EPP") {
      if (transfer.providerTransferId) {
        if (!provider.updateTransferAuthCode) return jsonError("The registrar adapter cannot update an in-progress transfer authorization code.", 501);
        await provider.updateTransferAuthCode(transfer.domainName, input.authCode);
      }
      await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { authCodeEncrypted: encryptSecret(input.authCode), failureReason: null } });
      await logAudit({ actorId: user.id, action: "domain.transfer.epp_updated", resource: "domain_transfer", resourceId: transfer.id });
      return jsonOk({ success: true, message: transfer.providerTransferId ? "Authorization code updated at the registrar." : "Authorization code updated for the pending transfer." });
    }

    if (!transfer.providerTransferId) return jsonError("This transfer has not been submitted to the registrar yet.", 409);

    if (input.action === "RESEND_EMAIL") {
      if (!provider.resendTransferVerification) return jsonError("The registrar adapter cannot resend transfer verification.", 501);
      await provider.resendTransferVerification(transfer.domainName);
      await logAudit({ actorId: user.id, action: "domain.transfer.verification_resent", resource: "domain_transfer", resourceId: transfer.id });
      return jsonOk({ success: true, message: "Transfer verification email requested from the registrar." });
    }

    if (!provider.resubmitTransfer) return jsonError("The registrar adapter cannot resubmit transfers to the registry.", 501);
    await provider.resubmitTransfer(transfer.domainName);
    await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { status: "IN_PROGRESS", failureReason: null } });
    await logAudit({ actorId: user.id, action: "domain.transfer.resubmitted", resource: "domain_transfer", resourceId: transfer.id });
    return jsonOk({ success: true, message: "Transfer resubmitted to the registry." });
  } catch (err) {
    return handleError(err);
  }
}
