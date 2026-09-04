import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";

/**
 * PayPal REST API integration. Reference: https://developer.paypal.com/api/rest/
 * Auth: https://developer.paypal.com/api/rest/authentication/
 * Webhooks: https://developer.paypal.com/api/rest/webhooks/
 *
 * PAYPAL_CLIENT_SECRET must never be sent to the browser. All calls here are
 * server-only.
 */

interface PayPalTokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: PayPalTokenCache | null = null;

function isConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function baseUrl(): string {
  if (process.env.PAYPAL_BASE_URL) return process.env.PAYPAL_BASE_URL;
  return process.env.PAYPAL_MODE === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function getAccessToken(): Promise<string> {
  if (!isConfigured()) throw new ProviderNotConfiguredError("PayPal");

  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`PayPal OAuth failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

async function paypalFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (init.idempotencyKey) {
    headers["PayPal-Request-Id"] = init.idempotencyKey;
  }
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.message || body?.details?.[0]?.description || `PayPal API error (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const PayPalProvider = {
  isConfigured,

  /**
   * Creates a PayPal order. The amount MUST already have been computed
   * server-side from the database (never trust a client-submitted amount).
   */
  async createOrder(params: {
    amountCents: number;
    currency: string;
    referenceId: string; // our internal Order.id
    description: string;
    idempotencyKey: string;
    returnUrl: string;
    cancelUrl: string;
  }) {
    const value = (params.amountCents / 100).toFixed(2);
    return paypalFetch("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: params.idempotencyKey,
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: params.referenceId,
            description: params.description.slice(0, 127),
            amount: { currency_code: params.currency, value },
          },
        ],
        application_context: {
          brand_name: "GetSawa",
          user_action: "PAY_NOW",
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      }),
    });
  },

  /** Captures payment for a previously-created, approved order. */
  async captureOrder(paypalOrderId: string, idempotencyKey: string) {
    return paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      idempotencyKey,
    });
  },

  async getOrder(paypalOrderId: string) {
    return paypalFetch(`/v2/checkout/orders/${paypalOrderId}`, { method: "GET" });
  },

  async refundCapture(captureId: string, amountCents?: number, currency = "USD") {
    return paypalFetch(`/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      body: JSON.stringify(
        amountCents
          ? { amount: { value: (amountCents / 100).toFixed(2), currency_code: currency } }
          : {}
      ),
    });
  },

  /**
   * Verifies a webhook's authenticity using PayPal's signature-verification
   * endpoint. Reference: https://developer.paypal.com/api/rest/webhooks/rest/
   */
  async verifyWebhookSignature(params: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
    webhookId: string;
    webhookEvent: unknown;
  }): Promise<boolean> {
    const result = await paypalFetch("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        transmission_id: params.transmissionId,
        transmission_time: params.transmissionTime,
        cert_url: params.certUrl,
        auth_algo: params.authAlgo,
        transmission_sig: params.transmissionSig,
        webhook_id: params.webhookId,
        webhook_event: params.webhookEvent,
      }),
    });
    return result.verification_status === "SUCCESS";
  },

  /** Sends a batch payout. https://developer.paypal.com/docs/payouts/ */
  async createPayout(params: {
    senderBatchId: string; // idempotency key
    recipientEmail: string;
    amountCents: number;
    currency: string;
    note?: string;
  }) {
    return paypalFetch("/v1/payments/payouts", {
      method: "POST",
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: params.senderBatchId,
          email_subject: "You have a payout from GetSawa",
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: { value: (params.amountCents / 100).toFixed(2), currency: params.currency },
            receiver: params.recipientEmail,
            note: params.note,
            sender_item_id: params.senderBatchId,
          },
        ],
      }),
    });
  },
};
