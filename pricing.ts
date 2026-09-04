import { Tld } from "@prisma/client";
import { clampCents, percentOfCents } from "@/lib/money";

export interface ComputedTldPrice {
  registerCents: number;
  renewCents: number;
  transferCents: number | null;
  currency: string;
}

/**
 * Computes retail domain prices from a Tld row according to its configured
 * pricingMethod. This is the single source of truth for domain pricing —
 * no component should hard-code a dollar figure for a TLD.
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

export function generateOrderNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `GS-${year}-${String(sequence).padStart(6, "0")}`;
}

export function generateInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(sequence).padStart(6, "0")}`;
}
