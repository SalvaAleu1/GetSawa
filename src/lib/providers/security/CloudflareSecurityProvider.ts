const API_BASE = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 20_000;

export type CloudflareDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
  data?: Record<string, unknown>;
};

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
  name_servers: string[];
  original_name_servers?: string[];
  plan?: { id?: string; name?: string };
};

export type CloudflareDnssec = {
  status: string;
  flags?: number;
  algorithm?: string | number;
  key_tag?: number;
  digest_type?: string | number;
  digest?: string;
  ds?: string;
};

type ApiEnvelope<T> = { success: boolean; result: T; errors?: Array<{ code?: number; message?: string }> };

function configured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim());
}

function messageOf(errors: Array<{ code?: number; message?: string }> | undefined, fallback: string) {
  const message = errors?.map((entry) => entry.message).filter(Boolean).join("; ");
  return message || fallback;
}

export class CloudflareSecurityProvider {
  readonly name = "cloudflare";
  isConfigured() { return configured(); }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.isConfigured()) throw new Error("Cloudflare security provider is not configured.");
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
      const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
      if (!response.ok || !body || body.success !== true) {
        throw new Error(messageOf(body?.errors, `Cloudflare API request failed with HTTP ${response.status}.`));
      }
      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck() {
    if (!this.isConfigured()) return { ok: false, message: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required." };
    try {
      const token = await this.call<{ status?: string }>("/user/tokens/verify");
      if (token.status && token.status !== "active") throw new Error(`Cloudflare API token is ${token.status}.`);
      await this.call<CloudflareZone[]>(`/zones?account.id=${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!)}&per_page=1`);
      return { ok: true, message: "Cloudflare API token and account zone access are verified." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Cloudflare connection failed." };
    }
  }

  async findZone(name: string): Promise<CloudflareZone | null> {
    const zones = await this.call<CloudflareZone[]>(`/zones?account.id=${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!)}&name=${encodeURIComponent(name.toLowerCase())}&per_page=20`);
    return zones.find((zone) => zone.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  async createZone(name: string): Promise<CloudflareZone> {
    const existing = await this.findZone(name);
    if (existing) return existing;
    return this.call<CloudflareZone>("/zones", {
      method: "POST",
      body: JSON.stringify({ name: name.toLowerCase(), account: { id: process.env.CLOUDFLARE_ACCOUNT_ID }, type: "full" }),
    });
  }

  async getZone(zoneId: string) {
    return this.call<CloudflareZone>(`/zones/${zoneId}`);
  }

  async listDnsRecords(zoneId: string): Promise<CloudflareDnsRecord[]> {
    return this.call<CloudflareDnsRecord[]>(`/zones/${zoneId}/dns_records?per_page=500`);
  }

  async createDnsRecord(zoneId: string, record: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; priority?: number; data?: Record<string, unknown> }) {
    return this.call<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl ?? 1,
        proxied: record.proxied ?? false,
        ...(record.priority != null ? { priority: record.priority } : {}),
        ...(record.data ? { data: record.data } : {}),
      }),
    });
  }

  async updateDnsRecord(zoneId: string, recordId: string, record: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; priority?: number; data?: Record<string, unknown> }) {
    return this.call<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl ?? 1,
        proxied: record.proxied ?? false,
        ...(record.priority != null ? { priority: record.priority } : {}),
        ...(record.data ? { data: record.data } : {}),
      }),
    });
  }

  async deleteDnsRecord(zoneId: string, recordId: string) {
    await this.call<{ id: string }>(`/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
  }

  async updateZoneSetting(zoneId: string, setting: string, value: string | number | boolean) {
    return this.call<Record<string, unknown>>(`/zones/${zoneId}/settings/${encodeURIComponent(setting)}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    });
  }

  async enableUniversalSsl(zoneId: string) {
    return this.call<{ enabled?: boolean }>(`/zones/${zoneId}/ssl/universal/settings`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: true }),
    });
  }

  async setWebProxy(zoneId: string, enabled: boolean, zoneName: string) {
    const records = await this.listDnsRecords(zoneId);
    const candidates = records.filter((record) => ["A", "AAAA", "CNAME"].includes(record.type) && [zoneName.toLowerCase(), `www.${zoneName.toLowerCase()}`].includes(record.name.toLowerCase()));
    for (const record of candidates) {
      if (record.proxied === enabled) continue;
      await this.updateDnsRecord(zoneId, record.id, { ...record, proxied: enabled });
    }
    return candidates.length;
  }

  async getDnssec(zoneId: string) {
    return this.call<CloudflareDnssec>(`/zones/${zoneId}/dnssec`);
  }

  async enableDnssec(zoneId: string) {
    return this.call<CloudflareDnssec>(`/zones/${zoneId}/dnssec`, { method: "POST" });
  }

  async disableDnssec(zoneId: string) {
    return this.call<CloudflareDnssec>(`/zones/${zoneId}/dnssec`, { method: "DELETE" });
  }
}

let provider: CloudflareSecurityProvider | null = null;
export function getCloudflareSecurityProvider() {
  if (!provider) provider = new CloudflareSecurityProvider();
  return provider;
}
