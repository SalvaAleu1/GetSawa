import { NextRequest } from "next/server";
import { requireApiKey, ApiAuthError } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { computeTldPrice } from "@/lib/pricing";
import { jsonError, jsonOk, handleError } from "@/lib/api";

/**
 * GET /api/v1/domains/search?q=example&tlds=com,net
 * Authorization: Bearer gs_live_...
 *
 * Same live-availability guarantee as the internal search endpoint — never
 * returns fabricated availability, and returns a clear 503 if the domain
 * provider isn't configured rather than guessing.
 */
export async function GET(req: NextRequest) {
  try {
    await requireApiKey(req, "domains:read");

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    if (!query || !/^[a-z0-9-]{1,63}$/.test(query)) {
      return jsonError("Query parameter `q` must be a valid domain label.", 400);
    }

    const activeTlds = await prisma.tld.findMany({ where: { isActive: true } });
    const requestedExt = searchParams.get("tlds");
    const tldsToCheck = requestedExt ? activeTlds.filter((t) => requestedExt.split(",").includes(t.extension)) : activeTlds.slice(0, 12);

    const provider = getDomainProvider();
    if (!provider.isConfigured()) {
      return jsonError("Domain availability is not currently available.", 503, { code: "PROVIDER_NOT_CONFIGURED" });
    }

    const candidates = tldsToCheck.map((t) => `${query}.${t.extension}`);
    const availability = await provider.checkAvailability(candidates);
    const priceByTld = new Map(activeTlds.map((t) => [t.extension, computeTldPrice(t)]));

    return jsonOk({
      results: availability.map((a) => ({
        domain: a.domain,
        tld: a.tld,
        available: a.available,
        registerPriceCents: priceByTld.get(a.tld)?.registerCents,
        currency: priceByTld.get(a.tld)?.currency ?? "USD",
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return jsonError(err.message, err.status);
    return handleError(err);
  }
}
