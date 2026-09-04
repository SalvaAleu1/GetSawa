import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";

interface PayPalTokenCache { accessToken: string; expiresAt: number }

const REQUEST_TIMEOUT_MS = 20_000;

function isConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function baseUrl(): string {
  if (process.env.PAYPAL_BASE_URL) return process.env.PAYPAL_BASE_URL;
  return process.env.PAYPAL_MODE === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

let tokenCache: PayPalTokenCache | null = null;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(): Promise<string> {
  if (!isConfigured()) throw new ProviderNotConfiguredError("PayPal");
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.accessToken;

  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithTimeout(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!data || typeof data !== "object" || typeof (data as { access_token?: unknown }).access_token !== "string" || typeof (data as { expires_in?: unknown }).expires_in !== "number") {
    throw new Error("PayPal OAuth returned an invalid response.");
  }
  const typed = data as { access_token: string; expires_in: number };
  tokenCache = { accessToken: typed.access_token, expiresAt: Date.now() + typed.expires_in * 1000 };
  return typed.access_token;
}

async function paypalFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = init.idempotencyKey;
  const { idempotencyKey: _idempotencyKey, ...requestInit } = init;
  const res = await fetchWithTimeout(`${baseUrl()}${path}`, { ...requestInit, headers, cache: "no-store" });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const obj = body && typeof body === "object" ? body as { message?: unknown; details?: Array<{ description?: unknown }> } : {};
    const message = typeof obj.message === "string" ? obj.message : typeof obj.details?.[0]?.description === "string" ? obj.details[0].description : `PayPal API error (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as Record<string, any>;
}

export const PayPalProvider = {
  isConfigured,

  async createOrder(params: { amountCents: number; currency: string; referenceId: string; description: string; idempotencyKey: string; returnUrl: string; cancelUrl: string }) {
    if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) throw new Error("Invalid PayPal order amount.");
    const value = (params.amountCents / 100).toFixed(2);
    return paypalFetch("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: params.idempotencyKey,
      body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ reference_id: params.referenceId, description: params.description.slice(0, 127), amount: { currency_code: params.currency.toUpperCase(), value } }], application_context: { brand_name: "GetSawa", user_action: "PAY_NOW", return_url: params.returnUrl, cancel_url: params.cancelUrl } }),
    });
  },

  async captureOrder(paypalOrderId: string, idempotencyKey: string) {
    if (!paypalOrderId) throw new Error("PayPal order ID is required.");
    return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: "POST", idempotencyKey });
  },

  async getOrder(paypalOrderId: string) {
    if (!paypalOrderId) throw new Error("PayPal order ID is required.");
    return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { method: "GET" });
  },

  async refundCapture(captureId: string, amountCents?: number, currency = "USD", idempotencyKey?: string) {
    if (!captureId) throw new Error("PayPal capture ID is required.");
    if (amountCents !== undefined && (!Number.isSafeInteger(amountCents) || amountCents <= 0)) throw new Error("Invalid refund amount.");
    return paypalFetch(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", idempotencyKey, body: JSON.stringify(amountCents !== undefined ? { amount: { value: (amountCents / 100).toFixed(2), currency_code: currency.toUpperCase() } } : {}) });
  },

  async verifyWebhookSignature(params: { transmissionId: string; transmissionTime: string; certUrl: string; authAlgo: string; transmissionSig: string; webhookId: string; webhookEvent: unknown }): Promise<boolean> {
    if (!params.transmissionId || !params.transmissionTime || !params.certUrl || !params.authAlgo || !params.transmissionSig || !params.webhookId) return false;
    const result = await paypalFetch("/v1/notifications/verify-webhook-signature", { method: "POST", body: JSON.stringify({ transmission_id: params.transmissionId, transmission_time: params.transmissionTime, cert_url: params.certUrl, auth_algo: params.authAlgo, transmission_sig: params.transmissionSig, webhook_id: params.webhookId, webhook_event: params.webhookEvent }) });
    return result.verification_status === "SUCCESS";
  },

  async createPayout(params: { senderBatchId: string; recipientEmail: string; amountCents: number; currency: string; note?: string }) {
    if (!params.senderBatchId || !params.recipientEmail || !Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) throw new Error("Invalid PayPal payout request.");
    return paypalFetch("/v1/payments/payouts", { method: "POST", idempotencyKey: params.senderBatchId, body: JSON.stringify({ sender_batch_header: { sender_batch_id: params.senderBatchId, email_subject: "You have a payout from GetSawa" }, items: [{ recipient_type: "EMAIL", amount: { value: (params.amountCents / 100).toFixed(2), currency: params.currency.toUpperCase() }, receiver: params.recipientEmail, note: params.note, sender_item_id: params.senderBatchId }] }) });
  },
};
