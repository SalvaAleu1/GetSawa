/**
 * All monetary values in GetSawa are stored and calculated as integer minor
 * units (cents). Never use floating point arithmetic for money — floats
 * cannot represent currency exactly and will eventually produce off-by-one
 * cent errors that show up as real accounting discrepancies.
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function addCents(...values: number[]): number {
  return values.reduce((sum, v) => sum + Math.round(v), 0);
}

export function percentOfCents(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

export function clampCents(cents: number, min = 0): number {
  return Math.max(min, Math.round(cents));
}
