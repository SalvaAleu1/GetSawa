import {
  DomainProvider,
  DomainAvailability,
  DomainPricing,
  TransferAvailability,
  AuthCodeRequestResult,
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
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
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
    const value = Number(code);
    return value === 300 || value === 301;
  }

  private isRegistrationSuccessCode(code: string | number): boolean {
    const value = Number(code);
    return value === 300 || value === 301 || value === 302;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const reply = await this.call<any>("checkRegisterAvailability", { domains: domains.join(",") });
    const available = normalizeList(reply.available?.domain);
    const unavailable = normalizeList(reply.unavailable?.domain);
    const invalid = normalizeList(reply.invalid?.domain);

    return domains.map((domain) => {
      const tld = domain.split(".").slice(1).join(".");
      const availableMatch = available.find((item) => domainName(item).toLowerCase() === domain.toLowerCase());
      if (availableMatch) {
        const premium = itemAttribute(availableMatch, "premium");
        const price = itemAttribute(availableMatch, "price");
        return {
          domain,
          tld,
          available: true,
          isPremium: premium === "1" || premium.toLowerCase() === "true",
          premiumPriceCents: price ? dollarsToCents(price) : undefined,
        };
      }
      if (unavailable.some((item) => domainName(item).toLowerCase() === domain.toLowerCase())) {
        return { domain, tld, available: false, isPremium: false, reason: "registered" };
      }
      if (invalid.some((item) => domainName(item).toLowerCase() === domain.toLowerCase())) {
        return { domain, tld, available: false, isPremium: false, reason: "invalid" };
      }
      return { domain, tld, available: false, isPremium: false, reason: "unknown" };
    });
  }

  async checkTransferAvailability(domains: string[]): Promise<TransferAvailability[]> {
    const reply = await this.call<any>("checkTransferAvailability", { domains: domains.join(",") });
    const available = normalizeList(reply.available?.domain);
    const unavailable = normalizeList(reply.unavailable?.domain);
    const currency = reply.currency || "USD";

    return domains.map((domain) => {
      const availableMatch = available.find((item) => domainName(item).toLowerCase() === domain.toLowerCase());
      if (availableMatch) {
        const premium = itemAttribute(availableMatch, "premium");
        const price = itemAttribute(availableMatch, "price");
        return {
          domain,
          available: true,
          premium: premium === "1" || premium.toLowerCase() === "true",
          priceCents: price ? dollarsToCents(price) : undefined,
          currency,
        };
      }
      const unavailableMatch = unavailable.find((item) => domainName(item).toLowerCase() === domain.toLowerCase());
      return {
        domain,
        available: false,
        reason: unavailableMatch ? itemAttribute(unavailableMatch, "reason") || "This domain cannot currently be transferred." : "Transfer eligibility could not be confirmed.",
      };
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

      let expiresAt: string | undefined;
      try {
        const info = await this.getDomainInfo(req.domain);
        expiresAt = info.expiresAt;
      } catch {
        // Registration itself succeeded. A later reconciliation can refresh it.
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
      // NameSilo's transfer-status endpoint is queried by domain name, not order number.
      return { success: true, status: "SUBMITTED", providerTransferId: req.domain };
    } catch (err: any) {
      return { success: false, status: "FAILED", errorMessage: err.message };
    }
  }

  async getTransferStatus(providerTransferId: string) {
    const reply = await this.call<any>("checkTransferStatus", { domain: providerTransferId });
    return { status: reply.status || "UNKNOWN", errorMessage: reply.message || reply.detail };
  }

  async requestAuthCode(domain: string): Promise<AuthCodeRequestResult> {
    const reply = await this.call<any>("retrieveAuthCode", { domain });
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Could not request the transfer authorization code.");
    return {
      requested: true,
      delivery: "ADMIN_EMAIL",
      message: "NameSilo accepted the EPP authorization-code request. The code is delivered to the domain administrative contact rather than returned through GetSawa.",
    };
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
      nameservers: normalizeList(reply.nameservers?.nameserver).map(domainName),
    };
  }

  async listDomains(): Promise<DomainInfo[]> {
    const reply = await this.call<any>("listDomains", {});
    const domains = normalizeList(reply.domains?.domain).map(domainName).filter(Boolean);
    return Promise.all(domains.map((domain) => this.getDomainInfo(domain)));
  }

  async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
    if (nameservers.length < 2 || nameservers.length > 13) throw new Error("Provide between 2 and 13 nameservers.");
    const params: Record<string, string> = { domain };
    nameservers.forEach((nameserver, index) => { params[`ns${index + 1}`] = nameserver; });
    const reply = await this.call<any>("changeNameServers", params);
    if (!this.isSuccessCode(reply.code)) throw new Error(reply.detail || "Failed to update nameservers.");
  }

  async listDnsRecords(domain: string): Promise<DnsRecordResult[]> {
    const reply = await this.call<any>("dnsListRecords", { domain });
    const records = normalizeList(reply.resource_record);
    return records.map((record: any) => ({
      providerRecordId: String(record.record_id),
      type: record.type,
      host: record.host ?? record.rrhost ?? "",
      value: record.value ?? record.rrvalue ?? "",
      ttl: Number(record.ttl ?? record.rrttl ?? 3600),
      priority: record.distance != null ? Number(record.distance) : undefined,
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
    const reply = await this.call<any>("addAutoRenewal", { domain });
    const code = Number(reply.code);
    if (!this.isSuccessCode(code) && code !== 250) throw new Error(reply.detail || "Failed to enable auto-renewal.");
  }

  async disableAutoRenew(domain: string): Promise<void> {
    const reply = await this.call<any>("removeAutoRenewal", { domain });
    const code = Number(reply.code);
    if (!this.isSuccessCode(code) && code !== 251) throw new Error(reply.detail || "Failed to disable auto-renewal.");
  }

  async setPrivacy(domain: string, enabled: boolean): Promise<{ supported: boolean; enabled: boolean }> {
    const operation = enabled ? "addPrivacy" : "removePrivacy";
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

function domainName(value: any): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return String(value.$t ?? value._ ?? value.name ?? value.domain ?? "");
}

function itemAttribute(value: any, key: string): string {
  if (!value || typeof value !== "object") return "";
  return String(value[key] ?? value[`@${key}`] ?? value.$?.[key] ?? "");
}

function dollarsToCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid price returned by NameSilo.");
  return Math.round(amount * 100);
}
