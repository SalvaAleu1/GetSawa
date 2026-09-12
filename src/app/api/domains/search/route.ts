import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { mapDiscoveryResult, normalizeDomainLabel } from "@/lib/domain-discovery";

/**
 * GET /api/domains/search?q=example&tlds=com,net,org
 *
 * The query is a domain label; callers may submit a full URL/domain and the
 * first label is normalized safely. Availability comes live from the active
 * registrar. Display pricing uses GetSawa's protected price floor while
 * checkout independently refreshes wholesale pricing again.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("domain-search", ip, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many searches. Please slow down.", 429);

    const { searchParams } = new URL(req.url);
    const query = normalizeDomainLabel(searchParams.get("q") || "");
    if (!query) return jsonError("Enter a valid domain name.", 400);

    const activeTlds = await prisma.tld.findMany({
      where: { isActive: true },
      orderBy: [{ isFeatured: "desc" }, { extension: "asc" }],
    });
    if (activeTlds.length === 0) {
      return jsonOk({
        query,
        configured: false,
        message: "No TLDs are configured yet. An administrator needs to activate TLDs before domain search is available.",
        results: [],
      });
    }

    const requested = (searchParams.get("tlds") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean)
      .slice(0, 25);
    const requestedSet = new Set(requested);
    const tldsToCheck = requested.length > 0
      ? activeTlds.filter((tld) => requestedSet.has(tld.extension.toLowerCase()))
      : activeTlds.slice(0, 20);

    if (tldsToCheck.length === 0) {
      return jsonError("None of the requested domain extensions are active in GetSawa.", 400);
    }

    const provider = getDomainProvider();
    if (!provider.isConfigured()) {
      return jsonOk({
        query,
        configured: false,
        message: "Domain availability is not currently available. The domain provider has not been configured yet.",
        results: tldsToCheck.map((tld) => ({
          tld: tld.extension,
          domain: `${query}.${tld.extension}`,
          available: false,
          checkoutEligible: false,
          status: "not_configured",
        })),
      });
    }

    const candidates = tldsToCheck.map((tld) => `${query}.${tld.extension}`);
    const [availability, policy] = await Promise.all([
      provider.checkAvailability(candidates),
      getPricingSafetyPolicy(),
    ]);
    const tldByExtension = new Map(tldsToCheck.map((tld) => [tld.extension.toLowerCase(), tld]));

    const results = availability.flatMap((item) => {
      const tld = tldByExtension.get(item.tld.toLowerCase());
      return tld ? [mapDiscoveryResult(item, tld, provider, policy)] : [];
    });

    return jsonOk({
      query,
      configured: true,
      provider: provider.name,
      exactPremiumPricingSupported: provider.supportsExactPremiumPricing?.() ?? false,
      checkedTlds: tldsToCheck.map((tld) => tld.extension),
      results,
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return jsonOk({ configured: false, message: error.message, results: [] });
    }
    return handleError(error);
  }
}
