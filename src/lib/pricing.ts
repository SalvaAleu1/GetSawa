import { Tld } from "@prisma/client";
import { clampCents, percentOfCents } from "@/lib/money";
import {
  PricingSafetyPolicy,
  SafeRetailBreakdown,
  computeSafeRetailPrice,
} from "@/lib/pricing-safety";

export interface ComputedTldPrice {
  registerCents: number;
  renewCents: number;
  transferCents: number | null;
  currency: string;
}

export interface ProtectedTldPrice extends ComputedTldPrice {
  wholesaleAvailable: boolean;
  safety: {
    register: SafeRetailBreakdown | null;
    renew: SafeRetailBreakdown | null;
    transfer: SafeRetailBreakdown | null;
  };
}

/**
 * Computes configured retail domain prices from a Tld row. This remains the
 * configuration-level price calculator; checkout must use
 * `computeProtectedTldPrice` with fresh provider wholesale prices so a stale
 * or manually-entered retail value can never silently sell below cost.
 */
export function computeTldPrice(tld: Tld): ComputedTldPrice {
  const currency = tld.currency;

  switch (tld.pricingMethod) {
    case "FIXED":
    case "CUSTOM": {
      return {
        registerCents: clampCents(tld.fixedRegisterCents ?? 0),
        renewCents: clampCents(tld.fixedRenewCents ?? tld.fixedRegisterCents ?? 0),
        transferCents: tld.fixedTransferCents != null ? clampCents(tld.fixedTransferCents) : null,
        currency,
      };
    }
    case "WHOLESALE_PLUS_FIXED": {
      const markup = tld.markupFixedCents ?? 0;
      return {
        registerCents: clampCents((tld.wholesaleRegisterCents ?? 0) + markup),
        renewCents: clampCents((tld.wholesaleRenewCents ?? tld.wholesaleRegisterCents ?? 0) + markup),
        transferCents:
          tld.wholesaleTransferCents != null ? clampCents(tld.wholesaleTransferCents + markup) : null,
        currency,
      };
    }
    case "WHOLESALE_PLUS_PERCENT":
    default: {
      const percent = tld.markupPercent ? Number(tld.markupPercent) : 0;
      const register = tld.wholesaleRegisterCents ?? 0;
      const renew = tld.wholesaleRenewCents ?? tld.wholesaleRegisterCents ?? 0;
      const transfer = tld.wholesaleTransferCents;
      return {
        registerCents: clampCents(register + percentOfCents(register, percent)),
        renewCents: clampCents(renew + percentOfCents(renew, percent)),
        transferCents: transfer != null ? clampCents(transfer + percentOfCents(transfer, percent)) : null,
        currency,
      };
    }
  }
}

/**
 * Applies GetSawa's loss-prevention floor to every configured TLD price.
 * The `wholesaleOverride` should come from a fresh provider quote in checkout;
 * the values stored on the TLD row are a fallback for display/admin purposes.
 */
export function computeProtectedTldPrice(
  tld: Tld,
  policy: PricingSafetyPolicy,
  wholesaleOverride?: {
    registerCents: number;
    renewCents: number;
    transferCents: number | null;
    currency?: string;
  },
): ProtectedTldPrice {
  const configured = computeTldPrice(tld);
  const registerWholesale = wholesaleOverride?.registerCents ?? tld.wholesaleRegisterCents;
  const renewWholesale = wholesaleOverride?.renewCents ?? tld.wholesaleRenewCents ?? tld.wholesaleRegisterCents;
  const transferWholesale = wholesaleOverride !== undefined
    ? wholesaleOverride.transferCents
    : tld.wholesaleTransferCents;

  const registerSafety = registerWholesale != null ? computeSafeRetailPrice(registerWholesale, policy) : null;
  const renewSafety = renewWholesale != null ? computeSafeRetailPrice(renewWholesale, policy) : null;
  const transferSafety = transferWholesale != null ? computeSafeRetailPrice(transferWholesale, policy) : null;

  return {
    registerCents: Math.max(configured.registerCents, registerSafety?.retailCents ?? configured.registerCents),
    renewCents: Math.max(configured.renewCents, renewSafety?.retailCents ?? configured.renewCents),
    transferCents:
      configured.transferCents == null && transferSafety == null
        ? null
        : Math.max(configured.transferCents ?? 0, transferSafety?.retailCents ?? 0),
    currency: wholesaleOverride?.currency ?? configured.currency,
    wholesaleAvailable: registerSafety != null && renewSafety != null,
    safety: {
      register: registerSafety,
      renew: renewSafety,
      transfer: transferSafety,
    },
  };
}

export function generateOrderNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `GS-${year}-${String(sequence).padStart(6, "0")}`;
}

export function generateInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(sequence).padStart(6, "0")}`;
}
