import type { CheckoutInput } from "@/lib/checkout";
import { CheckoutError } from "@/lib/checkout";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { getPremiumListingForCheckout } from "@/lib/premium-aftermarket";

type CartItem = CheckoutInput["items"][number];
type RegistrationItem = Extract<CartItem, { kind: "DOMAIN_REGISTRATION" }>;
type RenewalItem = Extract<CartItem, { kind: "DOMAIN_RENEWAL" }>;
type TransferItem = Extract<CartItem, { kind: "DOMAIN_TRANSFER" }>;

export async function validateDomainLifecycleCheckout(input: CheckoutInput, userId: string) {
  const registrationItems: RegistrationItem[] = [];
  const renewalItems: RenewalItem[] = [];
  const transferItems: TransferItem[] = [];
  for (const item of input.items) {
    if (item.kind === "DOMAIN_REGISTRATION") registrationItems.push(item);
    if (item.kind === "DOMAIN_RENEWAL") renewalItems.push(item);
    if (item.kind === "DOMAIN_TRANSFER") transferItems.push(item);
  }

  if (registrationItems.length > 0) {
    const names = [...new Set(registrationItems.map((item) => item.domain.trim().toLowerCase()))];
    const premiumListings = await prisma.premiumDomain.findMany({ where: { domainName: { in: names }, status: "LISTED" } });
    const byName = new Map(premiumListings.map((listing) => [listing.domainName.toLowerCase(), listing]));

    for (const item of registrationItems) {
      const listing = byName.get(item.domain.trim().toLowerCase());
      if (!listing) continue;
      if (item.years !== 1) throw new CheckoutError("Aftermarket premium domains are purchased as a one-time acquisition; renewal is billed separately after ownership transfer.");
      try {
        const verified = await getPremiumListingForCheckout(listing.id, userId);
        if (verified.meta.sellerUserId === userId) throw new CheckoutError("You cannot purchase your own aftermarket domain.");
      } catch (error) {
        if (error instanceof CheckoutError) throw error;
        throw new CheckoutError(error instanceof Error ? error.message : "This premium domain is not currently available for checkout.");
      }
    }
  }

  if (renewalItems.length > 0) {
    const ids = [...new Set(renewalItems.map((item) => item.domainId))];
    const domains = await prisma.domain.findMany({ where: { id: { in: ids }, userId }, include: { tld: true } });
    if (domains.length !== ids.length) throw new CheckoutError("One or more renewal domains are no longer available in your account.");
    const byId = new Map(domains.map((domain) => [domain.id, domain]));

    for (const item of renewalItems) {
      const domain = byId.get(item.domainId);
      if (!domain) throw new CheckoutError("Renewal domain not found.");
      if (["TRANSFERRED_AWAY", "REGISTRATION_FAILED", "CANCELLED", "PENDING_REGISTRATION"].includes(domain.status)) {
        throw new CheckoutError(`${domain.name} cannot be renewed while its status is ${domain.status.replace(/_/g, " ").toLowerCase()}.`);
      }
      if (item.years < domain.tld.minYears || item.years > domain.tld.maxYears) {
        throw new CheckoutError(`${domain.name} supports renewal periods from ${domain.tld.minYears} to ${domain.tld.maxYears} year${domain.tld.maxYears === 1 ? "" : "s"}.`);
      }
    }
  }

  if (transferItems.length > 0) {
    const provider = getDomainProvider();
    if (!provider.isConfigured()) throw new CheckoutError("Transfers are temporarily unavailable because the registrar is not configured.");
    if (!provider.checkTransferAvailability) throw new CheckoutError("The current registrar cannot verify transfer eligibility before payment.");

    const domains = [...new Set(transferItems.map((item) => item.domain.toLowerCase()))];
    const eligibility = await provider.checkTransferAvailability(domains);
    const byDomain = new Map(eligibility.map((result) => [result.domain.toLowerCase(), result]));
    for (const domain of domains) {
      const result = byDomain.get(domain);
      if (!result?.available) throw new CheckoutError(result?.reason ? `${domain}: ${result.reason}` : `${domain} cannot currently be transferred.`);
    }
  }
}
