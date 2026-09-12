import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";
import { computeProtectedTldPrice } from "@/lib/pricing";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/domains/search?q=example&tlds=com,net,org
 *
 * Availability always comes live from the configured domain provider. Retail
 * display prices use GetSawa's protected pricing floor over the latest cached
 * wholesale snapshot. Checkout independently refreshes wholesale pricing.
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
      : activeTlds.slice(0, 12);

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
    const policy = await getPricingSafetyPolicy();
    const exactPremiumPricingSupported = provider.supportsExactPremiumPricing?.() ?? false;

    const tldByExtension = new Map(tldsToCheck.map((t) => [t.extension, t]));
    const protectedPriceByTld = new Map(
      tldsToCheck.map((t) => [t.extension, computeProtectedTldPrice(t, policy)]),
    );

    const results = availability.map((a) => {
      const tld = tldByExtension.get(a.tld);
      const protectedPrice = protectedPriceByTld.get(a.tld);
      const exactPremiumRetail = a.isPremium && a.premiumPriceCents != null
        ? computeSafeRetailPrice(a.premiumPriceCents, policy).retailCents
        : null;
      const requiresPremiumVerification = Boolean(
        tld?.supportsPremium && !exactPremiumPricingSupported && !a.isPremium,
      );
      const premiumQuoteMissing = Boolean(a.isPremium && a.premiumPriceCents == null);
      const checkoutEligible = Boolean(
        a.available && protectedPrice?.wholesaleAvailable && !requiresPremiumVerification && !premiumQuoteMissing,
      );

      return {
        domain: a.domain,
        tld: a.tld,
        available: a.available,
        isPremium: a.isPremium,
        reason: a.reason,
        registerPriceCents: exactPremiumRetail ?? protectedPrice?.registerCents,
        renewPriceCents: a.isPremium ? undefined : protectedPrice?.renewCents,
        currency: protectedPrice?.currency ?? "USD",
        checkoutEligible,
        requiresPremiumVerification,
        premiumQuoteMissing,
        pricingProtected: Boolean(exactPremiumRetail != null || protectedPrice?.wholesaleAvailable),
        wholesaleUpdatedAt: tld?.wholesaleUpdatedAt?.toISOString() ?? null,
        provider: provider.name,
      };
    });

    return jsonOk({
      query,
      configured: true,
      provider: provider.name,
      exactPremiumPricingSupported,
      results,
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return jsonOk({ configured: false, message: err.message, results: [] });
    }
    return handleError(err);
  }
}
