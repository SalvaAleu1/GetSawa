import { Tld } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { DomainPricing, ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";

export interface WholesalePricingSnapshot {
  byTld: Map<string, DomainPricing>;
  provider: string;
  fetchedAt: Date;
}

export async function fetchLiveWholesalePricing(tlds: Array<Pick<Tld, "extension">>): Promise<WholesalePricingSnapshot> {
  const provider = getDomainProvider();
  if (!provider.isConfigured()) throw new ProviderNotConfiguredError(provider.name);

  const extensions = [...new Set(tlds.map((t) => t.extension.toLowerCase()))];
  const prices = await provider.getPricing(extensions);
  return {
    provider: provider.name,
    fetchedAt: new Date(),
    byTld: new Map(prices.map((price) => [price.tld.toLowerCase(), price])),
  };
}

export interface PricingSyncResult {
  provider: string;
  fetchedAt: string;
  requested: number;
  updated: number;
  missing: string[];
  currencyMismatches: Array<{ tld: string; expected: string; received: string }>;
}

/**
 * Pulls the registrar's account-specific wholesale prices into CloudSawa.
 * This is a cache/snapshot for browsing and admin reporting. Checkout still
 * fetches a fresh provider snapshot before allowing a domain transaction.
 */
export async function syncWholesalePricing(): Promise<PricingSyncResult> {
  // Sync every configured TLD, including inactive ones. Operators must be able
  // to review verified registrar cost before making an extension sellable.
  const tlds = await prisma.tld.findMany({ orderBy: { extension: "asc" } });
  const snapshot = await fetchLiveWholesalePricing(tlds);
  const missing: string[] = [];
  const currencyMismatches: Array<{ tld: string; expected: string; received: string }> = [];
  let updated = 0;

  for (const tld of tlds) {
    const live = snapshot.byTld.get(tld.extension.toLowerCase());
    if (!live) {
      missing.push(tld.extension);
      continue;
    }
    if (live.currency.toUpperCase() !== tld.currency.toUpperCase()) {
      currencyMismatches.push({ tld: tld.extension, expected: tld.currency, received: live.currency });
      continue;
    }

    await prisma.tld.update({
      where: { id: tld.id },
      data: {
        wholesaleRegisterCents: live.registerCents,
        wholesaleRenewCents: live.renewCents,
        wholesaleTransferCents: live.transferCents,
        wholesaleUpdatedAt: snapshot.fetchedAt,
      },
    });
    updated += 1;
  }

  return {
    provider: snapshot.provider,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    requested: tlds.length,
    updated,
    missing,
    currencyMismatches,
  };
}
