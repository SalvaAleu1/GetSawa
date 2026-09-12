import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { findActiveTldForDomain, mapDiscoveryResult, normalizeFullDomain } from "@/lib/domain-discovery";

const schema = z.object({
  domains: z.array(z.string()).min(1).max(25),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("domain-bulk-search", ip, { max: 10, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many bulk searches. Please try again shortly.", 429);

    const input = schema.parse(await req.json());
    const normalized = [...new Set(input.domains.map(normalizeFullDomain).filter((value): value is string => Boolean(value)))];
    if (normalized.length === 0) return jsonError("Enter at least one valid full domain name such as example.com.", 400);

    const activeTlds = await prisma.tld.findMany({ where: { isActive: true } });
    const recognized = normalized.flatMap((domain) => {
      const tld = findActiveTldForDomain(domain, activeTlds);
      return tld ? [{ domain, tld }] : [];
    });
    const unsupported = normalized.filter((domain) => !recognized.some((item) => item.domain === domain));

    if (recognized.length === 0) {
      return jsonOk({ configured: true, results: [], unsupported });
    }

    const provider = getDomainProvider();
    if (!provider.isConfigured()) {
      return jsonOk({
        configured: false,
        message: "The domain provider is not configured yet.",
        results: recognized.map(({ domain, tld }) => ({ domain, tld: tld.extension, available: false, checkoutEligible: false })),
        unsupported,
      });
    }

    const [availability, policy] = await Promise.all([
      provider.checkAvailability(recognized.map((item) => item.domain)),
      getPricingSafetyPolicy(),
    ]);
    const tldByDomain = new Map(recognized.map((item) => [item.domain, item.tld]));
    const results = availability.flatMap((item) => {
      const tld = tldByDomain.get(item.domain.toLowerCase()) ?? tldByDomain.get(item.domain);
      return tld ? [mapDiscoveryResult(item, tld, provider, policy)] : [];
    });

    return jsonOk({ configured: true, provider: provider.name, results, unsupported });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("Bulk search accepts between 1 and 25 domain names.", 400);
    return handleError(error);
  }
}
