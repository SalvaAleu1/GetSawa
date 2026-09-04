import {
  DomainProvider,
  DomainAvailability,
  DomainPricing,
  DomainRegistrationRequest,
  DomainRegistrationResult,
  DomainRenewalRequest,
  DomainRenewalResult,
  DomainTransferRequest,
  DomainTransferResult,
  DomainInfo,
  DnsRecordInput,
  DnsRecordResult,
  ProviderNotConfiguredError,
} from "./DomainProvider";

/**
 * NameSilo API client. Reference: https://www.namesilo.com/api-reference
 *
 * NameSilo's API is a simple GET-based REST API. Every request carries the
 * API key as a query parameter, so this provider must only ever be called
 * from server-side code — never expose NAMESILO_API_KEY to the browser.
 *
 * NameSilo returns `type=json` responses shaped as:
 *   { request: {...}, reply: { code, detail, ... } }
 * A `code` of 300 means success; other codes are documented per-operation
 * error codes. We treat anything other than 300/301(partial)/2xx-success as
 * a failure and surface `detail` as the human-readable reason.
 */
export class NameSiloProvider implements DomainProvider {
  readonly name = "namesilo";

  private get apiKey() {
    return process.env.NAMESILO_API_KEY;
  }

  private get baseUrl() {
    return process.env.NAMESILO_API_BASE_URL || "https://www.namesilo.com/api";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("NameSilo");
    }
  }

  private async call<T = any>(operation: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
    this.assertConfigured();
    const url = new URL(`${this.baseUrl}/${operation}`);
    url.searchParams.set("version", "1");
    url.searchParams.set("type", "json");
    url.searchParams.set("key", this.apiKey as string);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      throw new Error(`NameSilo API HTTP error ${res.status} on ${operation}`);
    }

    const json = await res.json();
    const reply = json?.reply;
    if (!reply) {
      throw new Error(`NameSilo API returned an unexpected response for ${operation}`);
    }
    return reply as T;
  }

  private isSuccessCode(code: string | number): boolean {
    const n = Number(code);
    // NameSilo uses 300 for full success and 301 for partial success on
    // batch operations; per-operation codes above are treated as failures.
    return n === 300 || n === 301;
  }

  // ---- Availability & Pricing ---------------------------------------------

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const reply = await this.call<any>("checkRegisterAvailability", {
      domains: domains.join(","),
    });

    const results: DomainAvailability[] = [];
    const available = normalizeList(reply.available?.domain);
    const unavailable = normalizeList(reply.unavailable?.domain);
    const invalid = normalizeList(reply.invalid?.domain);

    for (const d of domains) {
      const tld = d.split(".").slice(1).join(".");
      if (available.some((x) => x.toLowerCase() === d.toLowerCase())) {
        results.push({ domain: d, tld, available: true, isPremium: false });
      } else if (unavailable.some((x) => x.toLowerCase() === d.toLowerCase())) {
        results.push({ domain: d, tld, available: false, isPremium: false, reason: "registered" });
      } else if (invalid.some((x) => x.toLowerCase() === d.toLowerCase())) {
        results.push({ domain: d, tld, available: false, isPremium: false, reason: "invalid" });
      } else {
        results.push({ domain: d, tld, available: false, isPremium: false, reason: "unknown" });
      }
    }
    return results;
  }

  async getPricing(tlds: string[]): Promise<DomainPricing[]> {
    const reply = await this.call<any>("getPrices", {});
    const currency = reply.currency || "USD";
    const out: DomainPricing[] = [];
    for (const tld of tlds) {
      const key = tld.replace(/^\./, "");
      const node = reply[key];
      if (!node) continue;
      out.push({
        tld: key,
        registerCents: dollarsToCents(node.registration),
        renewCents: dollarsToCents(node.renew),
        transferCents: node.transfer ? dollarsToCents(node.transfer) : null,
        currency,
      });
    }
    return out;
  }

  // ---- Registration / Renewal / Transfer ----------------------------------

  async registerDomain(req: DomainRegistrationRequest): Promise<DomainRegistrationResult> {
    try {
      const reply = await this.call<any>("registerDomain", {
        domain: req.domain,
        years: req.years,
        private: req.privacy ? 1 : 0,
        auto_renew: req.autoRenew ? 1 : 0,
      });

      if (!this.isSuccessCode(reply.code)) {
        return {
          success: false,
          domain: req.domain,
          errorCode: String(reply.code),
          errorMessage: reply.detail || "Domain registration failed at the registrar.",
        };
      }

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + req.years);

      return {
        success: true,
        domain: req.domain,
        providerOrderId: reply.order_number ? String(reply.order_number) : undefined,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err: any) {
      return { success: false, domain: req.domain, errorMessage: err.message };
    }
  }

  async renewDomain(req: DomainRenewalRequest): Promise<DomainRenewalResult> {
    try {
      const reply = await this.call<any>("renewDomain", {
        domain: req.domain,
        years: req.years,
      });

      if (!this.isSuccessCode(reply.code)) {
        return {
          success: false,
          domain: req.domain,
          errorCode: String(reply.code),
          errorMessage: reply.detail || "Domain renewal failed at the registrar.",
        };
      }

      const info = await this.getDomainInfo(req.domain);
      return { success: true, domain: req.domain, newExpiresAt: info.expiresAt };
    } catch (err: any) {
      return { success: false, domain: req.domain, errorMessage: err.message };
    }
  }

  async transferDomain(req: DomainTransferRequest): Promise<DomainTransferResult> {
    try {
      const reply = await this.call<any>("transferDomain", {
        domain: req.domain,
        auth: req.authCode,
      });

      if (!this.isSuccessCode(reply.code)) {
        return {
          success: false,
          status: "FAILED",
          errorCode: String(reply.code),
          errorMessage: reply.detail || "Domain transfer could not be submitted.",
        };
      }

      return {
        success: true,
        status: "SUBMITTED",
        providerTransferId: reply.order_number ? String(reply.order_number) : req.domain,
      };
    } catch (err: any) {
      return { success: false, status: "FAILED", errorMessage: err.message };
    }
  }

  async getTransferStatus(providerTransferId: string) {
    const reply = await this.call<any>("checkTransferStatus", { domain: providerTransferId });
    return { status: reply.status || "UNKNOWN", errorMessage: reply.detail };
  }

  // ---- Domain info ---------------------------------------------------------

  async getDomainInfo(domain: string): Promise<DomainInfo> {
    const reply = await this.call<any>("getDomainInfo", { domain });
    return {
      domain,
      status: reply.status || "unknown",
      registeredAt: reply.created || undefined,
      expiresAt: reply.expires || undefined,
      autoRenew: reply.auto_renew === "1" || reply.auto_renew === 1,
      isLocked: reply.locked === "Yes" || reply.locked === "1",
      privacyEnabled: reply.private === "1" || reply.private === "Yes",
      nameservers: normalizeList(reply.nameservers?.nameserver),
    };
  }

  async listDomains(): Promise<DomainInfo[]> {
    const reply = await this.call<any>("listDomains", {});
    const domains = normalizeList(reply.domains?.domain);
    return Promise.all(domains.map((d) => this.getDomainInfo(d)));
  }

  async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
    const params: Record<string, string> = { domain };
    nameservers.forEach((ns, i) => {
      params[`ns${i + 1}`] = ns;
    });
    const reply = await this.call<any>("changeNameServers", params);
    if (!this.isSuccessCode(reply.code)) {
      throw new Error(reply.detail || "Failed to update nameservers.");
    }
  }

  // ---- DNS -------------------------------------------------------------------

  async listDnsRecords(domain: string): Promise<DnsRecordResult[]> {
    const reply = await this.call<any>("dnsListRecords", { domain });
    const records = normalizeList(reply.resource_record);
    return records.map((r: any) => ({
      providerRecordId: r.record_id,
      type: r.type,
      host: r.host,
      value: r.value,
      ttl: Number(r.ttl),
      priority: r.distance !== undefined ? Number(r.distance) : undefined,
    }));
  }

  async createDnsRecord(domain: string, record: DnsRecordInput): Promise<DnsRecordResult> {
    const reply = await this.call<any>("dnsAddRecord", {
      domain,
      rrtype: record.type,
      rrhost: record.host,
      rrvalue: record.value,
      rrttl: record.ttl ?? 3600,
      rrdistance: record.priority,
    });
    if (!this.isSuccessCode(reply.code)) {
      throw new Error(reply.detail || "Failed to create DNS record.");
    }
    return { ...record, providerRecordId: reply.record_id };
  }

  async updateDnsRecord(domain: string, providerRecordId: string, record: DnsRecordInput): Promise<DnsRecordResult> {
    const reply = await this.call<any>("dnsUpdateRecord", {
      domain,
      rrid: providerRecordId,
      rrhost: record.host,
      rrvalue: record.value,
      rrttl: record.ttl ?? 3600,
      rrdistance: record.priority,
    });
    if (!this.isSuccessCode(reply.code)) {
      throw new Error(reply.detail || "Failed to update DNS record.");
    }
    return { ...record, providerRecordId };
  }

  async deleteDnsRecord(domain: string, providerRecordId: string): Promise<void> {
    const reply = await this.call<any>("dnsDeleteRecord", { domain, rrid: providerRecordId });
    if (!this.isSuccessCode(reply.code)) {
      throw new Error(reply.detail || "Failed to delete DNS record.");
    }
  }

  // ---- Lock / auto-renew / privacy -------------------------------------------

  async lockDomain(domain: string): Promise<void> {
    const reply = await this.call<any>("domainLock", { domain });
    if (!this.isSuccessCode(reply.code) && Number(reply.code) !== 252) {
      throw new Error(reply.detail || "Failed to lock domain.");
    }
  }

  async unlockDomain(domain: string): Promise<void> {
    const reply = await this.call<any>("domainUnlock", { domain });
    if (!this.isSuccessCode(reply.code) && Number(reply.code) !== 253) {
      throw new Error(reply.detail || "Failed to unlock domain.");
    }
  }

  async enableAutoRenew(domain: string): Promise<void> {
    const reply = await this.call<any>("addAutoRenewal", { domain });
    if (!this.isSuccessCode(reply.code)) {
      throw new Error(reply.detail || "Failed to enable auto-renew.");
    }
  }

  async disableAutoRenew(domain: string): Promise<void> {
    const reply = await this.call<any>("removeAutoRenewal", { domain });
    if (!this.isSuccessCode(reply.code)) {
      throw new Error(reply.detail || "Failed to disable auto-renew.");
    }
  }

  async setPrivacy(domain: string, enabled: boolean): Promise<{ supported: boolean; enabled: boolean }> {
    try {
      const reply = await this.call<any>(enabled ? "addPrivacy" : "removePrivacy", { domain });
      if (!this.isSuccessCode(reply.code)) {
        // Many ccTLDs do not support WHOIS privacy — NameSilo returns a
        // specific error code in that case rather than a generic failure.
        return { supported: false, enabled: false };
      }
      return { supported: true, enabled };
    } catch {
      return { supported: false, enabled: false };
    }
  }
}

function normalizeList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function dollarsToCents(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return Math.round(Number(value) * 100);
}
