import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const provider = getDomainProvider();
    const info = await provider.getDomainInfo(domain.name);

    const updated = await prisma.domain.update({
      where: { id: domain.id },
      data: {
        registeredAt: info.registeredAt ? new Date(info.registeredAt) : domain.registeredAt,
        expiresAt: info.expiresAt ? new Date(info.expiresAt) : domain.expiresAt,
        autoRenew: info.autoRenew,
        isLocked: info.isLocked,
        privacyEnabled: info.privacyEnabled,
        nameservers: info.nameservers,
        status: normalizeStatus(info.status, domain.status),
      },
      include: { tld: true },
    });

    await logAudit({
      actorId: user.id,
      action: "domain.reconciled",
      resource: "domain",
      resourceId: domain.id,
      metadata: { provider: provider.name, providerStatus: info.status },
    });

    return jsonOk({ domain: updated, providerStatus: info.status, syncedAt: new Date().toISOString() });
  } catch (err) {
    return handleError(err);
  }
}

function normalizeStatus(providerStatus: string, current: string) {
  const status = providerStatus.toLowerCase();
  if (status.includes("active") || status.includes("registered")) return "ACTIVE" as const;
  if (status.includes("expired")) return "EXPIRED" as const;
  if (status.includes("transfer")) return "TRANSFER_PENDING" as const;
  return current as any;
}
