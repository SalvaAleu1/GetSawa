import { Tld } from "@prisma/client";
import { DomainAvailability, DomainProvider } from "@/lib/providers/domains/DomainProvider";
import { PricingSafetyPolicy, computeSafeRetailPrice } from "@/lib/pricing-safety";
import { computeProtectedTldPrice } from "@/lib/pricing";

export interface DomainDiscoveryResult {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
  reason?: string;
  registerPriceCents?: number;
  renewPriceCents?: number;
  currency: string;
  checkoutEligible: boolean;
  requiresPremiumVerification: boolean;
  premiumQuoteMissing: boolean;
  pricingProtected: boolean;
  wholesaleUpdatedAt: string | null;
  supportsPrivacy: boolean;
  minYears: number;
  maxYears: number;
  provider: string;
}

export function normalizeDomainLabel(value: string): string | null {
  const clean = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.replace(/\.$/, "") ?? "";
  const label = clean.includes(".") ? clean.split(".")[0] ?? "" : clean;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && !/^[a-z0-9]$/.test(label)) return null;
  return label;
}

export function normalizeFullDomain(value: string): string | null {
  const clean = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.replace(/\.$/, "") ?? "";
  if (clean.length < 3 || clean.length > 253 || !clean.includes(".")) return null;
  const labels = clean.split(".");
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && !/^[a-z0-9]$/.test(label))) return null;
  return clean;
}

export function findActiveTldForDomain(domain: string, tlds: Tld[]): Tld | null {
  const normalized = domain.toLowerCase();
  return [...tlds]
    .sort((a, b) => b.extension.length - a.extension.length)
    .find((tld) => normalized.endsWith(`.${tld.extension.toLowerCase()}`)) ?? null;
}

export function mapDiscoveryResult(
  availability: DomainAvailability,
  tld: Tld,
  provider: DomainProvider,
  policy: PricingSafetyPolicy,
): DomainDiscoveryResult {
  const protectedPrice = computeProtectedTldPrice(tld, policy);
  const exactPremiumPricingSupported = provider.supportsExactPremiumPricing?.() ?? false;
  const exactPremiumRetail = availability.isPremium && availability.premiumPriceCents != null
    ? computeSafeRetailPrice(availability.premiumPriceCents, policy).retailCents
    : null;

  // A registrar that cannot authoritatively detect and quote registry-premium
  // names must fail closed for premium-capable TLDs. NameSilo's classic API
  // currently reports ordinary availability but does not expose the exact
  // registry premium amount before purchase.
  const requiresPremiumVerification = Boolean(tld.supportsPremium && !exactPremiumPricingSupported);
  const premiumQuoteMissing = Boolean(availability.isPremium && availability.premiumPriceCents == null);
  const checkoutEligible = Boolean(
    availability.available &&
      protectedPrice.wholesaleAvailable &&
      !requiresPremiumVerification &&
      !premiumQuoteMissing,
  );

  return {
    domain: availability.domain,
    tld: tld.extension,
    available: availability.available,
    isPremium: availability.isPremium,
    reason: availability.reason,
    registerPriceCents: exactPremiumRetail ?? protectedPrice.registerCents,
    renewPriceCents: availability.isPremium ? undefined : protectedPrice.renewCents,
    currency: protectedPrice.currency,
    checkoutEligible,
    requiresPremiumVerification,
    premiumQuoteMissing,
    pricingProtected: Boolean(exactPremiumRetail != null || protectedPrice.wholesaleAvailable),
    wholesaleUpdatedAt: tld.wholesaleUpdatedAt?.toISOString() ?? null,
    supportsPrivacy: tld.supportsPrivacy,
    minYears: tld.minYears,
    maxYears: tld.maxYears,
    provider: provider.name,
  };
}
