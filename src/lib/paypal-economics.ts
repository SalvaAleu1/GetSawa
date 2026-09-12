function amountToCents(value: unknown): number | null {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function extractPayPalCaptureEconomics(payload: Record<string, any>) {
  const purchaseUnit = Array.isArray(payload.purchase_units) ? asObject(payload.purchase_units[0]) : {};
  const payments = asObject(purchaseUnit.payments);
  const capture = Array.isArray(payments.captures) ? asObject(payments.captures[0]) : {};
  const amount = asObject(capture.amount ?? purchaseUnit.amount);
  const breakdown = asObject(capture.seller_receivable_breakdown);
  const feeAmount = asObject(breakdown.paypal_fee);
  const netAmount = asObject(breakdown.net_amount);
  return {
    captureId: typeof capture.id === "string" ? capture.id : null,
    grossCents: amountToCents(amount.value),
    currency: typeof amount.currency_code === "string" ? amount.currency_code.toUpperCase() : null,
    providerFeeCents: amountToCents(feeAmount.value),
    netCents: amountToCents(netAmount.value),
  };
}

export function extractPayPalRefundEconomics(payload: Record<string, any>) {
  const amount = asObject(payload.amount);
  const breakdown = asObject(payload.seller_payable_breakdown);
  const gross = asObject(breakdown.gross_amount ?? amount);
  const paypalFee = asObject(breakdown.paypal_fee);
  const net = asObject(breakdown.net_amount);
  return {
    refundId: typeof payload.id === "string" ? payload.id : null,
    grossCents: amountToCents(gross.value ?? amount.value),
    currency: typeof (gross.currency_code ?? amount.currency_code) === "string" ? String(gross.currency_code ?? amount.currency_code).toUpperCase() : null,
    providerFeeCents: amountToCents(paypalFee.value),
    netCents: amountToCents(net.value),
  };
}
