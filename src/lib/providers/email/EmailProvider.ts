import crypto from "crypto";

const REQUEST_TIMEOUT_MS = 20_000;

type OpenSrsCluster = "A" | "B";
type OpenSrsResponse = {
  success?: boolean;
  error?: string;
  error_number?: number;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, any>;
  type?: string;
  token?: string;
  duration?: number;
  [key: string]: unknown;
};

export interface MailboxRequest {
  domain: string;
  localPart: string;
  customerEmail: string;
  storageMb: number;
  idempotencyKey: string;
  initialPassword: string;
}

export interface MailboxResult {
  success: boolean;
  providerMailboxId?: string;
  errorMessage?: string;
}

export interface EmailDnsRecord {
  type: "MX" | "CNAME" | "TXT";
  host: string;
  value: string;
  priority?: number;
  purpose: "mail-routing" | "mail-client" | "spf";
}

export interface MailboxSummary {
  address: string;
  status: string;
  quotaBytes: number | null;
  usedBytes: number | null;
  aliases: string[];
  forwardRecipients: string[];
  deliveryForward: boolean;
  services: {
    imap: string | null;
    pop3: string | null;
    inbound: string | null;
    smtpRelay: string | null;
    webmail: string | null;
  };
  lastLoginAt: Date | null;
}

export interface EmailProviderHealth {
  ok: boolean;
  provider: string;
  message: string;
  cluster: OpenSrsCluster | null;
  webmailUrl: string | null;
  imapSmtpHost: string | null;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  healthCheck(): Promise<EmailProviderHealth>;
  ensureDomain(domain: string, options?: { quotaMb?: number; limitUsers?: number }): Promise<void>;
  getMailbox(providerMailboxId: string): Promise<MailboxSummary | null>;
  createMailbox(req: MailboxRequest): Promise<MailboxResult>;
  changePassword(providerMailboxId: string, newPassword: string): Promise<void>;
  updateMailbox(providerMailboxId: string, settings: { aliases?: string[]; forwardRecipients?: string[]; storageMb?: number }): Promise<void>;
  suspendMailbox(providerMailboxId: string): Promise<void>;
  reactivateMailbox(providerMailboxId: string): Promise<void>;
  deleteMailbox(providerMailboxId: string): Promise<void>;
  createWebmailSession(providerMailboxId: string): Promise<{ url: string; expiresAt: Date }>;
  requiredDnsRecords(domain: string): EmailDnsRecord[];
}

function envConfigured() {
  return Boolean(
    process.env.OPENSRS_EMAIL_ADMIN_USER
      && process.env.OPENSRS_EMAIL_ADMIN_PASSWORD
      && process.env.OPENSRS_EMAIL_COMPANY
      && normalizeCluster(process.env.OPENSRS_EMAIL_CLUSTER),
  );
}

function normalizeCluster(value?: string): OpenSrsCluster | null {
  const normalized = value?.trim().toUpperCase();
  return normalized === "A" || normalized === "B" ? normalized : null;
}

function apiBaseUrl(cluster: OpenSrsCluster) {
  const explicit = process.env.OPENSRS_EMAIL_API_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    const parsed = new URL(explicit);
    if (parsed.protocol !== "https:") throw new Error("OPENSRS_EMAIL_API_BASE_URL must use HTTPS.");
    return explicit;
  }
  return cluster === "A" ? "https://admin.a.hostedemail.com/api" : "https://admin.b.hostedemail.com/api";
}

function webmailBaseUrl(cluster: OpenSrsCluster) {
  return cluster === "A" ? "https://mail.hostedemail.com" : "https://mail.b.hostedemail.com";
}

function mailHost(cluster: OpenSrsCluster) {
  return cluster === "A" ? "mail.hostedemail.com" : "mail.b.hostedemail.com";
}

function credentials() {
  return {
    user: process.env.OPENSRS_EMAIL_ADMIN_USER!,
    password: process.env.OPENSRS_EMAIL_ADMIN_PASSWORD!,
    client: "GetSawa Hosted Email",
  };
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function normalizeList(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string").map(normalizeAddress).filter(Boolean)
    : [];
}

function unixDate(value: unknown): Date | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function randomMailboxPassword(seed: string) {
  // OpenSRS rejects spaces and double quotes and checks that the password does
  // not contain the mailbox/domain. This generator deliberately uses only a
  // safe ASCII subset and does not encode customer/domain text.
  const digest = crypto.createHash("sha256").update(`${seed}:${crypto.randomUUID()}`).digest("base64url");
  return `Gs!${digest.slice(0, 28)}9a`;
}

export function generateInitialMailboxPassword(idempotencyKey: string) {
  return randomMailboxPassword(idempotencyKey);
}

class OpenSrsHostedEmailProvider implements EmailProvider {
  readonly name = "opensrs_hosted_email";

  isConfigured() {
    return envConfigured();
  }

  private cluster(): OpenSrsCluster {
    const cluster = normalizeCluster(process.env.OPENSRS_EMAIL_CLUSTER);
    if (!cluster) throw new Error("OPENSRS_EMAIL_CLUSTER must be A or B.");
    return cluster;
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<OpenSrsResponse> {
    if (!this.isConfigured()) throw new Error("OpenSRS Hosted Email is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${apiBaseUrl(this.cluster())}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ credentials: credentials(), ...payload }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as OpenSrsResponse | null;
      if (!response.ok || !body) throw new Error(`OpenSRS Email ${method} failed with HTTP ${response.status}.`);
      if (body.success !== true) {
        const error = body.error || `OpenSRS Email ${method} returned an unsuccessful response.`;
        const wrapped = new Error(error) as Error & { errorNumber?: number };
        wrapped.errorNumber = typeof body.error_number === "number" ? body.error_number : undefined;
        throw wrapped;
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<EmailProviderHealth> {
    if (!this.isConfigured()) {
      return { ok: false, provider: this.name, message: "OpenSRS Hosted Email credentials, company and cluster are required.", cluster: null, webmailUrl: null, imapSmtpHost: null };
    }
    const cluster = this.cluster();
    try {
      await this.call("get_company", { company: process.env.OPENSRS_EMAIL_COMPANY });
      return {
        ok: true,
        provider: this.name,
        message: `Connected to OpenSRS Hosted Email Cluster ${cluster}; company administration access is verified.`,
        cluster,
        webmailUrl: webmailBaseUrl(cluster),
        imapSmtpHost: mailHost(cluster),
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        message: error instanceof Error ? error.message : "OpenSRS Hosted Email connection failed.",
        cluster,
        webmailUrl: webmailBaseUrl(cluster),
        imapSmtpHost: mailHost(cluster),
      };
    }
  }

  async ensureDomain(domain: string, options: { quotaMb?: number; limitUsers?: number } = {}) {
    const normalized = normalizeAddress(domain);
    const attributes: Record<string, unknown> = {
      default_password_encoding: "BCRYPT",
      service_imap4: "enabled",
      service_pop3: "enabled",
      service_smtpin: "enabled",
      service_smtprelay: "enabled",
      service_smtprelay_webmail: "enabled",
      service_webmail: "enabled",
    };
    if (Number.isFinite(options.quotaMb) && Number(options.quotaMb) > 0) attributes.quota = Math.trunc(Number(options.quotaMb) * 1024 * 1024);
    if (Number.isInteger(options.limitUsers) && Number(options.limitUsers) > 0) attributes.limit_users = options.limitUsers;
    try {
      await this.call("change_domain", { domain: normalized, attributes, create_only: true });
    } catch (error) {
      // OpenSRS error 23 means the domain already exists. Reconcile instead of
      // mutating existing domain-wide settings on a retry.
      if ((error as Error & { errorNumber?: number })?.errorNumber !== 23) throw error;
      await this.call("get_domain", { domain: normalized });
    }
  }

  async getMailbox(providerMailboxId: string): Promise<MailboxSummary | null> {
    try {
      const body = await this.call("get_user", { user: normalizeAddress(providerMailboxId) });
      const attributes = body.attributes && typeof body.attributes === "object" ? body.attributes : {};
      const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
      const quota = metadata.quota && typeof metadata.quota === "object" ? metadata.quota as Record<string, unknown> : {};
      const lastLogin = metadata.last_login && typeof metadata.last_login === "object" ? metadata.last_login as Record<string, unknown> : {};
      const last = [lastLogin.imap4, lastLogin.pop3, lastLogin.webmail, lastLogin.smtprelay].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => b - a)[0];
      return {
        address: normalizeAddress(providerMailboxId),
        status: typeof metadata.status === "string" ? metadata.status : "unknown",
        quotaBytes: Number.isFinite(Number(quota.bytes_max)) ? Number(quota.bytes_max) : null,
        usedBytes: Number.isFinite(Number(quota.bytes_used)) ? Number(quota.bytes_used) : null,
        aliases: normalizeList((attributes as Record<string, unknown>).aliases),
        forwardRecipients: normalizeList((attributes as Record<string, unknown>).forward_recipients),
        deliveryForward: (attributes as Record<string, unknown>).delivery_forward === true,
        services: {
          imap: typeof (attributes as Record<string, unknown>).service_imap4 === "string" ? String((attributes as Record<string, unknown>).service_imap4) : null,
          pop3: typeof (attributes as Record<string, unknown>).service_pop3 === "string" ? String((attributes as Record<string, unknown>).service_pop3) : null,
          inbound: typeof (attributes as Record<string, unknown>).service_smtpin === "string" ? String((attributes as Record<string, unknown>).service_smtpin) : null,
          smtpRelay: typeof (attributes as Record<string, unknown>).service_smtprelay === "string" ? String((attributes as Record<string, unknown>).service_smtprelay) : null,
          webmail: typeof (attributes as Record<string, unknown>).service_webmail === "string" ? String((attributes as Record<string, unknown>).service_webmail) : null,
        },
        lastLoginAt: unixDate(last),
      };
    } catch (error) {
      const number = (error as Error & { errorNumber?: number })?.errorNumber;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (number === 4 || message.includes("does not exist") || message.includes("not found")) return null;
      throw error;
    }
  }

  async createMailbox(req: MailboxRequest): Promise<MailboxResult> {
    const domain = normalizeAddress(req.domain);
    const localPart = req.localPart.trim().toLowerCase();
    const address = `${localPart}@${domain}`;
    try {
      await this.ensureDomain(domain, { quotaMb: req.storageMb });
      try {
        await this.call("change_user", {
          user: address,
          create_only: true,
          attributes: {
            type: "mailbox",
            password: req.initialPassword,
            quota: Math.trunc(req.storageMb * 1024 * 1024),
            delivery_local: true,
            delivery_forward: false,
            service_imap4: "enabled",
            service_pop3: "enabled",
            service_smtpin: "enabled",
            service_smtprelay: "enabled",
            service_smtprelay_webmail: "enabled",
            service_webmail: "enabled",
            notes_external: `GetSawa order-item ${req.idempotencyKey}`,
          },
        });
      } catch (error) {
        if ((error as Error & { errorNumber?: number })?.errorNumber !== 23) throw error;
        const existing = await this.getMailbox(address);
        if (!existing) throw error;
      }
      return { success: true, providerMailboxId: address };
    } catch (error) {
      return { success: false, errorMessage: error instanceof Error ? error.message : "OpenSRS mailbox provisioning failed." };
    }
  }

  async changePassword(providerMailboxId: string, newPassword: string) {
    await this.call("change_user", { user: normalizeAddress(providerMailboxId), attributes: { password: newPassword } });
  }

  async updateMailbox(providerMailboxId: string, settings: { aliases?: string[]; forwardRecipients?: string[]; storageMb?: number }) {
    const attributes: Record<string, unknown> = {};
    if (settings.aliases) attributes.aliases = settings.aliases.map(normalizeAddress);
    if (settings.forwardRecipients) {
      const forwards = settings.forwardRecipients.map(normalizeAddress);
      attributes.forward_recipients = forwards;
      attributes.delivery_forward = forwards.length > 0;
      attributes.delivery_local = true;
    }
    if (Number.isFinite(settings.storageMb) && Number(settings.storageMb) > 0) attributes.quota = Math.trunc(Number(settings.storageMb) * 1024 * 1024);
    if (Object.keys(attributes).length === 0) return;
    await this.call("change_user", { user: normalizeAddress(providerMailboxId), attributes });
  }

  async suspendMailbox(providerMailboxId: string) {
    await this.call("change_user", {
      user: normalizeAddress(providerMailboxId),
      attributes: {
        service_imap4: "suspended",
        service_pop3: "suspended",
        service_smtpin: "suspended",
        service_smtprelay: "suspended",
        service_smtprelay_webmail: "suspended",
        service_webmail: "suspended",
      },
    });
  }

  async reactivateMailbox(providerMailboxId: string) {
    await this.call("change_user", {
      user: normalizeAddress(providerMailboxId),
      attributes: {
        service_imap4: "enabled",
        service_pop3: "enabled",
        service_smtpin: "enabled",
        service_smtprelay: "enabled",
        service_smtprelay_webmail: "enabled",
        service_webmail: "enabled",
      },
    });
  }

  async deleteMailbox(providerMailboxId: string) {
    await this.call("delete_user", { user: normalizeAddress(providerMailboxId) });
  }

  async createWebmailSession(providerMailboxId: string) {
    const body = await this.call("generate_token", {
      user: normalizeAddress(providerMailboxId),
      type: "sso",
      duration: 1,
      reason: "GetSawa customer webmail sign-in",
    });
    if (typeof body.token !== "string" || !body.token) throw new Error("OpenSRS did not return a webmail login token.");
    const cluster = this.cluster();
    const url = new URL(webmailBaseUrl(cluster));
    url.searchParams.set("_task", "login");
    url.searchParams.set("_action", "login");
    url.searchParams.set("user", normalizeAddress(providerMailboxId));
    url.searchParams.set("pass", body.token);
    url.searchParams.set("direct", "1");
    return { url: url.toString(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  }

  requiredDnsRecords(domain: string): EmailDnsRecord[] {
    const normalized = normalizeAddress(domain);
    const suffix = this.cluster() === "A" ? "hostedemail.com" : "b.hostedemail.com";
    return [
      { type: "MX", host: "@", value: `mx.${normalized}.cust.${suffix}`, priority: 0, purpose: "mail-routing" },
      { type: "CNAME", host: "mail", value: `mail.${normalized}.cust.${suffix}`, purpose: "mail-client" },
      { type: "TXT", host: "@", value: "v=spf1 include:_spf.hostedemail.com ~all", purpose: "spf" },
    ];
  }
}

export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "none";
  isConfigured() { return false; }
  async healthCheck(): Promise<EmailProviderHealth> { return { ok: false, provider: this.name, message: "OpenSRS Hosted Email is not configured.", cluster: null, webmailUrl: null, imapSmtpHost: null }; }
  async ensureDomain(): Promise<void> { throw new Error("No business email provider is configured."); }
  async getMailbox(): Promise<MailboxSummary | null> { return null; }
  async createMailbox(): Promise<MailboxResult> { return { success: false, errorMessage: "No business email provider is configured yet." }; }
  async changePassword(): Promise<void> { throw new Error("No business email provider is configured."); }
  async updateMailbox(): Promise<void> { throw new Error("No business email provider is configured."); }
  async suspendMailbox(): Promise<void> { throw new Error("No business email provider is configured."); }
  async reactivateMailbox(): Promise<void> { throw new Error("No business email provider is configured."); }
  async deleteMailbox(): Promise<void> { throw new Error("No business email provider is configured."); }
  async createWebmailSession(): Promise<{ url: string; expiresAt: Date }> { throw new Error("No business email provider is configured."); }
  requiredDnsRecords(): EmailDnsRecord[] { return []; }
}

export function getEmailProvider(): EmailProvider {
  return envConfigured() ? new OpenSrsHostedEmailProvider() : new UnconfiguredEmailProvider();
}
