import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { computeProtectedTldPrice } from "@/lib/pricing";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("domain-transfer-check", ip, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many transfer checks. Please slow down.", 429);

    const domain = (new URL(req.url).searchParams.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.$/, "");
    if (!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
      return jsonError("Enter a valid fully qualified domain name.", 400);
    }

    const extension = domain.split(".").slice(1).join(".");
    const tld = await prisma.tld.findUnique({ where: { extension } });
    if (!tld || !tld.isActive) return jsonError(`.${extension} is not currently supported for transfers.`, 400);

    const provider = getDomainProvider();
    if (!provider.isConfigured()) return jsonError("Domain transfers are temporarily unavailable because the registrar is not configured.", 503);
    if (!provider.checkTransferAvailability) return jsonError("The current registrar adapter cannot verify transfer eligibility before checkout.", 501);

    const result = (await provider.checkTransferAvailability([domain]))[0];
    if (!result) return jsonError("The registrar did not return a transfer eligibility result.", 502);

    const policy = await getPricingSafetyPolicy();
    const protectedPrice = computeProtectedTldPrice(tld, policy);
    return jsonOk({
      domain,
      extension,
      eligible: result.available,
      reason: result.reason,
      premium: Boolean(result.premium),
      registrarQuotedPriceCents: result.priceCents,
      currency: result.currency || protectedPrice.currency,
      estimatedTransferPriceCents: protectedPrice.transferCents,
      priceProtected: protectedPrice.wholesaleAvailable,
      requirements: [
        "The domain must be unlocked at the current registrar.",
        "The domain must normally be more than 60 days old and not transferred within the last 60 days.",
        "The EPP/authorization code must be exact and is case-sensitive.",
        "The registrant/admin email may need to approve the transfer.",
      ],
    });
  } catch (err) {
    return handleError(err);
  }
}
