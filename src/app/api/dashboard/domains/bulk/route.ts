import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  domainIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["LOCK", "UNLOCK", "AUTO_RENEW_ON", "AUTO_RENEW_OFF"]),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const domains = await prisma.domain.findMany({
      where: { id: { in: input.domainIds }, userId: user.id },
      select: { id: true, name: true, isLocked: true, autoRenew: true },
    });
    if (domains.length !== new Set(input.domainIds).size) {
      return jsonError("One or more selected domains were not found.", 404);
    }

    const provider = getDomainProvider();
    const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];

    for (const domain of domains) {
      try {
        if (input.action === "LOCK" && !domain.isLocked) await provider.lockDomain(domain.name);
        if (input.action === "UNLOCK" && domain.isLocked) await provider.unlockDomain(domain.name);
        if (input.action === "AUTO_RENEW_ON" && !domain.autoRenew) await provider.enableAutoRenew(domain.name);
        if (input.action === "AUTO_RENEW_OFF" && domain.autoRenew) await provider.disableAutoRenew(domain.name);

        await prisma.domain.update({
          where: { id: domain.id },
          data: {
            ...(input.action === "LOCK" ? { isLocked: true } : {}),
            ...(input.action === "UNLOCK" ? { isLocked: false } : {}),
            ...(input.action === "AUTO_RENEW_ON" ? { autoRenew: true } : {}),
            ...(input.action === "AUTO_RENEW_OFF" ? { autoRenew: false } : {}),
          },
        });
        results.push({ id: domain.id, name: domain.name, success: true });
      } catch (err) {
        results.push({ id: domain.id, name: domain.name, success: false, error: err instanceof Error ? err.message : "Provider action failed." });
      }
    }

    await logAudit({
      actorId: user.id,
      action: "domain.bulk_action",
      resource: "domain",
      metadata: { action: input.action, requested: input.domainIds.length, succeeded: results.filter((r) => r.success).length },
    });

    return jsonOk({ action: input.action, results, partialFailure: results.some((r) => !r.success) });
  } catch (err) {
    return handleError(err);
  }
}
