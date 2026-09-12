import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const recordSchema = z.object({
  keyTag: z.number().int().min(0).max(65535),
  algorithm: z.number().int().min(0).max(255),
  digestType: z.number().int().min(0).max(255),
  digest: z.string().trim().min(8).max(512),
});
const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable"), records: z.array(recordSchema).min(1).max(8) }),
  z.object({ action: z.literal("disable") }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const provider = getDomainProvider();
    if (!provider.getDnssecStatus) {
      return jsonOk({
        supported: false,
        enabled: false,
        records: [],
        provider: provider.name,
        message: "The current registrar adapter does not yet expose verified DNSSEC automation. No DS-record changes will be guessed or simulated.",
      });
    }
    const status = await provider.getDnssecStatus(domain.name);
    return jsonOk({ ...status, provider: provider.name });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const domain = await getOwnedDomainOrThrow(id, user.id);
    const input = changeSchema.parse(await req.json());
    const provider = getDomainProvider();

    if (input.action === "enable") {
      if (!provider.enableDnssec) return jsonError("DNSSEC automation is not supported by the current registrar adapter.", 501);
      const status = await provider.enableDnssec(domain.name, input.records);
      await logAudit({ actorId: user.id, action: "dns.dnssec.enabled", resource: "domain", resourceId: domain.id, metadata: { recordCount: input.records.length } });
      return jsonOk(status);
    }

    if (!provider.disableDnssec) return jsonError("DNSSEC automation is not supported by the current registrar adapter.", 501);
    const status = await provider.disableDnssec(domain.name);
    await logAudit({ actorId: user.id, action: "dns.dnssec.disabled", resource: "domain", resourceId: domain.id });
    return jsonOk(status);
  } catch (err) {
    return handleError(err);
  }
}
