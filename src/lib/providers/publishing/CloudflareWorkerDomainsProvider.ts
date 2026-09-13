const API_BASE = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 20_000;

type Envelope<T> = { success: boolean; result: T; errors?: Array<{ message?: string }> };
export type WorkerDomain = { id: string; cert_id: string; hostname: string; service: string; zone_id: string; zone_name: string; environment?: string };

export class CloudflareWorkerDomainsProvider {
  isConfigured() {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim() && this.serviceName());
  }
  serviceName() { return process.env.CLOUDFLARE_WORKER_SERVICE_NAME?.trim() || "getsawa"; }

  private async call<T>(path: string, init: RequestInit = {}) {
    if (!this.isConfigured()) throw new Error("Cloudflare Worker custom-domain provider is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as Envelope<T> | null;
      if (!response.ok || !body?.success) throw new Error(body?.errors?.map((e) => e.message).filter(Boolean).join("; ") || `Cloudflare API request failed with HTTP ${response.status}.`);
      return body.result;
    } finally { clearTimeout(timeout); }
  }

  async attach(hostname: string, zoneId: string, zoneName: string) {
    return this.call<WorkerDomain>(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/domains`, {
      method: "PUT",
      body: JSON.stringify({ hostname: hostname.toLowerCase(), service: this.serviceName(), zone_id: zoneId, zone_name: zoneName.toLowerCase() }),
    });
  }
  async get(id: string) { return this.call<WorkerDomain>(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/domains/${id}`); }
  async list() { return this.call<WorkerDomain[]>(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/domains`); }
  async detach(id: string) { await this.call<unknown>(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/domains/${id}`, { method: "DELETE" }); }
}

let instance: CloudflareWorkerDomainsProvider | null = null;
export function getCloudflareWorkerDomainsProvider() { if (!instance) instance = new CloudflareWorkerDomainsProvider(); return instance; }
