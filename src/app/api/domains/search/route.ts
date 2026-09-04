import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";
import { computeTldPrice } from "@/lib/pricing";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/domains/search?q=example&tlds=com,net,org
 *
 * Availability always comes live from the configured domain provider.
 * There is no cached/fake availability path. If the provider is not
 * configured, we say so explicitly instead of guessing.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("domain-search", ip, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many searches. Please slow down.", 429);

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    if (!query || !/^[a-z0-9-]{1,63}$/.test(query)) {
      return jsonError("Enter a valid domain name (letters, numbers, hyphens only).", 400);
    }

    const activeTlds = await prisma.tld.findMany({ where: { isActive: true } });
    if (activeTlds.length === 0) {
      return jsonOk({
        query,
        configured: false,
        message: "No TLDs are configured yet. An administrator needs to activate TLDs before domain search is available.",
        results: [],
      });
    }

    const requestedExt = searchParams.get("tlds");
    const tldsToCheck = requestedExt
      ? activeTlds.filter((t) => requestedExt.split(",").includes(t.extension))
      : activeTlds.slice(0, 12); // cap unsolicited fan-out

    const provider = getDomainProvider();
    if (!provider.isConfigured()) {
      return jsonOk({
        query,
        configured: false,
        message: "Domain availability is not currently available. The domain provider has not been configured yet.",
        results: tldsToCheck.map((t) => ({ tld: t.extension, domain: `${query}.${t.extension}`, status: "not_configured" })),
      });
    }

    const candidates = tldsToCheck.map((t) => `${query}.${t.extension}`);
    const availability = await provider.checkAvailability(candidates);

    const priceByTld = new Map(activeTlds.map((t) => [t.extension, computeTldPrice(t)]));

    const results = availability.map((a) => {
      const price = priceByTld.get(a.tld);
      return {
        domain: a.domain,
        tld: a.tld,
        available: a.available,
        isPremium: a.isPremium,
        reason: a.reason,
        registerPriceCents: a.isPremium ? a.premiumPriceCents : price?.registerCents,
        renewPriceCents: price?.renewCents,
        currency: price?.currency ?? "USD",
      };
    });

    return jsonOk({ query, configured: true, results });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return jsonOk({ configured: false, message: err.message, results: [] });
    }
    return handleError(err);
  }
}
