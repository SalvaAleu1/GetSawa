import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const transfer = await prisma.domainTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.userId !== user.id) return jsonError("Transfer not found.", 404);
    if (!transfer.providerTransferId) return jsonOk({ transfer, registrarChecked: false });

    const provider = getDomainProvider();
    const providerStatus = await provider.getTransferStatus(transfer.providerTransferId);
    const mapped = mapTransferStatus(providerStatus.status);
    const updated = await prisma.domainTransfer.update({
      where: { id },
      data: {
        status: mapped,
        failureReason: mapped === "FAILED" ? (providerStatus.errorMessage ?? transfer.failureReason) : transfer.failureReason,
      },
    });

    let domain = transfer.domainId ? await prisma.domain.findUnique({ where: { id: transfer.domainId } }) : null;
    if (mapped === "COMPLETED") {
      const info = await provider.getDomainInfo(transfer.domainName);
      const extension = transfer.domainName.split(".").slice(1).join(".");
      const tld = await prisma.tld.findUnique({ where: { extension } });
      if (!tld) return jsonError(`Transfer completed, but .${extension} is not configured in GetSawa. Staff reconciliation is required.`, 409);

      domain = await prisma.domain.upsert({
        where: { name: transfer.domainName },
        create: {
          userId: user.id,
          tldId: tld.id,
          name: transfer.domainName,
          status: "ACTIVE",
          providerName: provider.name,
          registeredAt: info.registeredAt ? new Date(info.registeredAt) : null,
          expiresAt: info.expiresAt ? new Date(info.expiresAt) : null,
          autoRenew: info.autoRenew,
          isLocked: info.isLocked,
          privacyEnabled: info.privacyEnabled,
          nameservers: info.nameservers,
        },
        update: {
          userId: user.id,
          tldId: tld.id,
          status: "ACTIVE",
          providerName: provider.name,
          registeredAt: info.registeredAt ? new Date(info.registeredAt) : undefined,
          expiresAt: info.expiresAt ? new Date(info.expiresAt) : undefined,
          autoRenew: info.autoRenew,
          isLocked: info.isLocked,
          privacyEnabled: info.privacyEnabled,
          nameservers: info.nameservers,
        },
      });
      await prisma.domainTransfer.update({ where: { id }, data: { domainId: domain.id, failureReason: null } });
    }

    await logAudit({
      actorId: user.id,
      action: "domain.transfer.refreshed",
      resource: "domain_transfer",
      resourceId: transfer.id,
      metadata: { providerStatus: providerStatus.status, mappedStatus: mapped, domainId: domain?.id },
    });

    return jsonOk({ transfer: { ...updated, domainId: domain?.id ?? transfer.domainId }, registrarChecked: true, providerStatus: providerStatus.status });
  } catch (err) {
    return handleError(err);
  }
}

function mapTransferStatus(raw: string): "SUBMITTED" | "PENDING_AUTH" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" {
  const status = raw.toLowerCase();
  if (status.includes("complete")) return "COMPLETED";
  if (status.includes("cancel")) return "CANCELLED";
  if (status.includes("fail") || status.includes("denied") || status.includes("reject")) return "FAILED";
  if (status.includes("auth") || status.includes("verification")) return "PENDING_AUTH";
  if (status.includes("registry") || status.includes("progress") || status.includes("pending")) return "IN_PROGRESS";
  return "SUBMITTED";
}
