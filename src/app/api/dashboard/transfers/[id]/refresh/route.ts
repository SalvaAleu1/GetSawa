import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const transfer = await prisma.domainTransfer.findUnique({ where: { id: params.id } });
    if (!transfer || transfer.userId !== user.id) return jsonError("Transfer not found.", 404);

    if (!transfer.providerTransferId) {
      return jsonOk({ transfer }); // not submitted to the registrar yet
    }

    const provider = getDomainProvider();
    const status = await provider.getTransferStatus(transfer.providerTransferId);

    const mapped = mapNameSiloStatus(status.status);
    const updated = await prisma.domainTransfer.update({
      where: { id: transfer.id },
      data: { status: mapped, failureReason: status.errorMessage ?? transfer.failureReason },
    });

    // A completed transfer means the domain is now ours — hand off to the
    // customer's domain portfolio if it isn't there already.
    if (mapped === "COMPLETED") {
      const existing = await prisma.domain.findUnique({ where: { name: transfer.domainName } });
      if (!existing) {
        const ext = transfer.domainName.split(".").slice(1).join(".");
        const tld = await prisma.tld.findUnique({ where: { extension: ext } });
        if (tld) {
          const domain = await prisma.domain.create({
            data: {
              userId: user.id,
              tldId: tld.id,
              name: transfer.domainName,
              status: "ACTIVE",
              providerName: provider.name,
              registeredAt: new Date(),
            },
          });
          await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { domainId: domain.id } });
        }
      }
    }

    return jsonOk({ transfer: updated });
  } catch (err) {
    return handleError(err);
  }
}

function mapNameSiloStatus(raw: string): "SUBMITTED" | "PENDING_AUTH" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" {
  const s = raw.toLowerCase();
  if (s.includes("complete")) return "COMPLETED";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("fail") || s.includes("denied") || s.includes("reject")) return "FAILED";
  if (s.includes("auth")) return "PENDING_AUTH";
  if (s.includes("progress") || s.includes("pending")) return "IN_PROGRESS";
  return "SUBMITTED";
}
