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
 * NameSilo API client. All credentials remain server-side.
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
    if (!this.isConfigured()) throw new ProviderNotConfiguredError("NameSilo");
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
    if (!res.ok) throw new Error(`NameSilo API HTTP error ${res.status} on ${operation}`);

    const json = await res.json();
    const reply = json?.reply;
    if (!reply) throw new Error(`NameSilo API returned an unexpected response for ${operation}`);
    return reply as T;
  }

  private isSuccessCode(code: string | number): boolean {
    const n = Number(code);
    return n === 300 || n === 301;
  }

  private isRegistrationSuccessCode(code: string | number): boolean {
    // 300 = normal success, 301 = registered but default nameservers used,
    // 302 = registered but the account default contact profile was used.
    const n = Number(code);
    return n === 300 || n === 301 || n === 302;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const reply = await this.call<any>("checkRegisterAvailability", { domains: domains.join(",") });
    const available = normalizeList(reply.available?.domain);
    const unavailable = normalizeList(reply.unavailable?.domain);
    const invalid = normalizeList(reply.invalid?.domain);

    return domains.map((d) => {
      const tld = d.split(".").slice(1).join(".");
      if (available.some((x) => x.toLowerCase() === d.toLowerCase())) {
        return { domain: d, tld, available: true, isPremium: false };
      }
      if (unavailable.some((x) => x.toLowerCase() === d.toLowerCase())) {
        return { domain: d, tld, available: false, isPremium: false, reason: "registered" };
      }
      if (invalid.some((x) => x.toLowerCase() === d.toLowerCase())) {
        return { domain: d, tld, available: false, isPremium: false, reason: "invalid" };
      }
      return { domain: d, tld, available: false, isPremium: false, reason: "unknown" };
    });
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
        transferCents: node.transfer != null ? dollarsToCents(node.transfer) : null,
        currency,
      });
    }
    return out;
  }

  async registerDomain(req: DomainRegistrationRequest): Promise<DomainRegistrationResult> {
    try {
      const reply = await this.call<any>("registerDomain", {
        domain: req.domain,
        years: req.years,
        private: req.privacy ? 1 : 0,
        auto_renew: req.autoRenew ? 1 : 0,
        ...contactParams(req.registrant),
      });

      if (!this.isRegistrationSuccessCode(reply.code)) {
        return {
          success: false,
          domain: req.domain,
          errorCode: String(reply.code),
          errorMessage: reply.detail || "Domain registration failed at the registrar.",
        };
      }

      // Do not manufacture an expiry date from our server clock. Ask the
      // registrar for the authoritative expiry after registration.
      let expiresAt: string | undefined;
      try {
        const info = await this.getDomainInfo(req.domain);
        expiresAt = info.expiresAt;
      } catch {
        // Registration itself succeeded. The domain can be reconciled later.
      }

      return {
        success: true,
        domain: req.domain,
        providerOrderId: reply.order_number ? String(reply.order_number) : undefined,
        expiresAt,
      };
    } catch (err: any) {
      return { success: false, domain: req.domain, errorMessage: err.message };
    }
  }

  async renewDomain(req: DomainRenewalRequest): Promise<DomainRenewalResult> {
    try {
      const reply = await this.call<any>("renewDomain", { domain: req.domain, years: req.years });
      if (!this.isSuccessCode(reply.code)) {
        return { success: false, domain: req.domain, errorCode: String(reply.code), errorMessage: reply.detail || "Domain renewal failed at the registrar." };
      }
      const info = await this.getDomainInfo(req.domain);
      return { success: true, domain: req.domain, newExpiresAt: info.expiresAt };
    } catch (err: any) {
      return { success: false, domain: req.domain, errorMessage: err.message };
    }
  }

  async transferDomain(req: DomainTransferRequest): Promise<DomainTransferResult> {
    try {
      const reply = await this.call<any>("transferDomain", { domain: req.domain, auth: req.authCode });
      if (!this.isSuccessCode(reply.code)) {
        return { success: false, status: "FAILED", errorCode: String(reply.code), errorMessage: reply.detail || "Domain transfer could not be submitted." };
      }
      return { success: true, status: "SUBMITTED", providerTransferId: reply.order_number ? String(reply.order_number) : req.domain };
    } catch (err: any) {
      return { success: false, status: "FAILED", errorMessage: err.message };
    }
  }

  async getTransferStatus(providerTransferId: string) {
    const reply = await this.call<any>("checkTransferStatus", { domain: providerTransferId });
    return { status: reply.status || "UNKNOWN", errorMessage: reply.detail };
  }

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
    if (nameservers.length < 2 || nameservers.length > 13) throw new Error("Provide between 2 and 13 nameservers.");
    const params: Record<string, string> = { domain };
    nameservers.forEach((ns, i) => { params[`ns${i + 1}`] = ns; });
    const reply = await this.call<any>("changeNameServers", params);
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to update nameservers.");
  }

  async listDnsRecords(domain: string): Promise<DnsRecordResult[]> {
    const reply = await this.call<any>("dnsListRecords", { domain });
    const records = normalizeList(reply.resource_record);
    return records.map((r: any) => ({
      providerRecordId: String(r.record_id),
      type: r.type,
      host: r.host ?? r.rrhost ?? "",
      value: r.value ?? r.rrvalue ?? "",
      ttl: Number(r.ttl ?? r.rrttl ?? 3600),
      priority: r.distance != null ? Number(r.distance) : undefined,
    }));
  }

  async createDnsRecord(domain: string, record: DnsRecordInput): Promise<DnsRecordResult> {
    const reply = await this.call<any>("dnsAddRecord", {
      domain,
      rrtype: record.type,
      rrhost: normalizeDnsHost(record.host, domain),
      rrvalue: record.value,
      rrttl: record.ttl ?? 3600,
      rrdistance: record.priority,
    });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to create DNS record.");
    return { ...record, host: normalizeDnsHost(record.host, domain), providerRecordId: String(reply.record_id) };
  }

  async updateDnsRecord(domain: string, providerRecordId: string, record: DnsRecordInput): Promise<DnsRecordResult> {
    const reply = await this.call<any>("dnsUpdateRecord", {
      domain,
      rrid: providerRecordId,
      rrtype: record.type,
      rrhost: normalizeDnsHost(record.host, domain),
      rrvalue: record.value,
      rrttl: record.ttl ?? 3600,
      rrdistance: record.priority,
    });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to update DNS record.");
    return { ...record, host: normalizeDnsHost(record.host, domain), providerRecordId };
  }

  async deleteDnsRecord(domain: string, providerRecordId: string): Promise<void> {
    const reply = await this.call<any>("dnsDeleteRecord", { domain, rrid: providerRecordId });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to delete DNS record.");
  }

  async lockDomain(domain: string): Promise<void> {
    const reply = await this.call<any>("domainLock", { domain });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to lock domain.");
  }

  async unlockDomain(domain: string): Promise<void> {
    const reply = await this.call<any>("domainUnlock", { domain });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to unlock domain.");
  }

  async enableAutoRenew(domain: string): Promise<void> {
    const reply = await this.call<any>("autoRenewalAdd", { domain });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to enable auto-renewal.");
  }

  async disableAutoRenew(domain: string): Promise<void> {
    const reply = await this.call<any>("autoRenewalDelete", { domain });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to disable auto-renewal.");
  }

  async setPrivacy(domain: string, enabled: boolean): Promise<{ supported: boolean; enabled: boolean }> {
    const operation = enabled ? "privacyAdd" : "privacyDelete";
    const reply = await this.call<any>(operation, { domain });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || `Failed to ${enabled ? "enable" : "disable"} WHOIS privacy.`);
    return { supported: true, enabled };
  }
}

function contactParams(contact: DomainRegistrationRequest["registrant"]): Record<string, string | undefined> {
  return {
    fn: contact.firstName,
    ln: contact.lastName,
    ad: contact.address1,
    ad2: contact.address2,
    cy: contact.city,
    st: contact.state,
    zp: contact.zip,
    ct: contact.country,
    em: contact.email,
    ph: contact.phone,
    cp: contact.company,
  };
}

function normalizeDnsHost(host: string, domain: string): string {
  const clean = host.trim().replace(/\.$/, "");
  const suffix = `.${domain.replace(/\.$/, "")}`;
  if (clean === domain || clean.endsWith(suffix)) return clean.slice(0, -suffix.length) || "@";
  return clean || "@";
}

function normalizeList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function dollarsToCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid price returned by NameSilo.");
  return Math.round(n * 100);
}
