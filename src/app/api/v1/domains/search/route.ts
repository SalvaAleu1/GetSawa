import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { computeTldPrice } from "@/lib/pricing";
import { jsonError, jsonOk } from "@/lib/api";
import { withDeveloperApi } from "@/lib/developer-platform";

export async function GET(req: NextRequest) {
  return withDeveloperApi(req, "domains:read", "/api/v1/domains/search", async () => {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    if (!query || !/^[a-z0-9-]{1,63}$/.test(query)) return jsonError("Query parameter `q` must be a valid domain label.", 400);
    const activeTlds = await prisma.tld.findMany({ where: { isActive: true } });
    const requested = searchParams.get("tlds")?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const tlds = requested?.length ? activeTlds.filter((item) => requested.includes(item.extension.toLowerCase())) : activeTlds.slice(0, 12);
    if (tlds.length === 0) return jsonOk({ results: [] });
    const provider = getDomainProvider();
    if (!provider.isConfigured()) return jsonError("Domain availability is not currently available.", 503, { code: "PROVIDER_NOT_CONFIGURED" });
    const availability = await provider.checkAvailability(tlds.map((item) => `${query}.${item.extension}`));
    const prices = new Map(activeTlds.map((item) => [item.extension, computeTldPrice(item)]));
    return jsonOk({ results: availability.map((item) => ({ domain: item.domain, tld: item.tld, available: item.available, registerPriceCents: prices.get(item.tld)?.registerCents, currency: prices.get(item.tld)?.currency ?? "USD" })) });
  });
}
