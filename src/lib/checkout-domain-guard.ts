import type { CheckoutInput } from "@/lib/checkout";
import { CheckoutError } from "@/lib/checkout";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";

type CartItem = CheckoutInput["items"][number];
type RenewalItem = Extract<CartItem, { kind: "DOMAIN_RENEWAL" }>;
type TransferItem = Extract<CartItem, { kind: "DOMAIN_TRANSFER" }>;

export async function validateDomainLifecycleCheckout(input: CheckoutInput, userId: string) {
  const renewalItems: RenewalItem[] = [];
  const transferItems: TransferItem[] = [];
  for (const item of input.items) {
    if (item.kind === "DOMAIN_RENEWAL") renewalItems.push(item);
    if (item.kind === "DOMAIN_TRANSFER") transferItems.push(item);
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
