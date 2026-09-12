import crypto from "crypto";

const REQUEST_TIMEOUT_MS = 20_000;

export interface HostingAccountRequest {
  planCode: string;
  domain: string;
  customerEmail: string;
  idempotencyKey: string;
}

export interface HostingAccountResult {
  success: boolean;
  providerAccountId?: string;
  controlPanelUrl?: string;
  nameservers?: string[];
  serverIp?: string;
  planCode?: string;
  errorMessage?: string;
}

export interface HostingPlan {
  code: string;
  diskMb: number | null;
  bandwidthMb: number | null;
  maxFtpAccounts: number | null;
  maxEmailAccounts: number | null;
  maxDatabases: number | null;
}

export interface HostingAccountSummary {
  username: string;
  domain: string;
  planCode: string | null;
  suspended: boolean;
  diskUsedMb: number | null;
  diskLimitMb: number | null;
  bandwidthUsedMb: number | null;
  email: string | null;
  serverIp: string | null;
}

export interface HostingProviderHealth {
  ok: boolean;
  provider: string;
  message: string;
  plans: HostingPlan[];
}

export interface HostingProvider {
  readonly name: string;
  isConfigured(): boolean;
  healthCheck(): Promise<HostingProviderHealth>;
  listPlans(): Promise<HostingPlan[]>;
  provisionAccount(req: HostingAccountRequest): Promise<HostingAccountResult>;
  getAccountSummary(providerAccountId: string): Promise<HostingAccountSummary | null>;
  createControlPanelSession(providerAccountId: string): Promise<{ url: string; expiresAt: Date | null }>;
  suspendAccount(providerAccountId: string, reason?: string): Promise<void>;
  unsuspendAccount(providerAccountId: string): Promise<void>;
  terminateAccount(providerAccountId: string): Promise<void>;
}

type WhmResponse = {
  data?: Record<string, any>;
  metadata?: {
    command?: string;
    reason?: string;
    result?: number;
    version?: number;
  };
};

function envConfigured() {
  return Boolean(process.env.WHM_BASE_URL && process.env.WHM_USERNAME && process.env.WHM_API_TOKEN);
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:") throw new Error("WHM_BASE_URL must use HTTPS.");
  return trimmed;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "unlimited") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mbFromPossiblyHumanValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "unlimited") return null;
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/^([0-9.]+)\s*(k|m|g|t)b?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (unit === "k") return amount / 1024;
  if (unit === "m") return amount;
  if (unit === "g") return amount * 1024;
  if (unit === "t") return amount * 1024 * 1024;
  return null;
}

function bytesToMb(value: unknown): number | null {
  const bytes = finiteNumber(value);
  return bytes === null || bytes < 0 ? null : bytes / (1024 * 1024);
}

function deriveUsername(domain: string, idempotencyKey: string) {
  const digest = crypto.createHash("sha256").update(`${domain}:${idempotencyKey}`).digest("hex");
  const suffix = domain.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8).padEnd(8, "x");
  return `g${digest.slice(0, 7)}${suffix}`.slice(0, 16);
}

class CpanelWhmHostingProvider implements HostingProvider {
  readonly name = "cpanel_whm";

  isConfigured() {
    return envConfigured();
  }

  private async call(functionName: string, params: Record<string, string | number | undefined> = {}): Promise<WhmResponse> {
    if (!this.isConfigured()) throw new Error("cPanel/WHM hosting is not configured.");
    const baseUrl = normalizeBaseUrl(process.env.WHM_BASE_URL!);
    const url = new URL(`${baseUrl}/json-api/${functionName}`);
    url.searchParams.set("api.version", "1");
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `whm ${process.env.WHM_USERNAME}:${process.env.WHM_API_TOKEN}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as WhmResponse | null;
      if (!response.ok || !body) throw new Error(`WHM ${functionName} request failed with HTTP ${response.status}.`);
      if (body.metadata?.result !== 1) throw new Error(body.metadata?.reason || `WHM ${functionName} failed.`);
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<HostingProviderHealth> {
    if (!this.isConfigured()) return { ok: false, provider: this.name, message: "WHM_BASE_URL, WHM_USERNAME and WHM_API_TOKEN are required.", plans: [] };
    try {
      const plans = await this.listPlans();
      // Phase 15 promises live bandwidth visibility. showbw is read-only and
      // doubles as an ACL check for the reseller/API token.
      await this.call("showbw", { showres: process.env.WHM_USERNAME });
      return { ok: true, provider: this.name, message: `Connected to WHM. ${plans.length} creatable hosting plan${plans.length === 1 ? "" : "s"} found; bandwidth reporting is available.`, plans };
    } catch (error) {
      return { ok: false, provider: this.name, message: error instanceof Error ? error.message : "WHM connection failed.", plans: [] };
    }
  }

  async listPlans(): Promise<HostingPlan[]> {
    const body = await this.call("listpkgs", { want: "creatable" });
    const packages = Array.isArray(body.data?.pkg) ? body.data!.pkg : [];
    return packages.flatMap((raw: any) => {
      const code = typeof raw?.name === "string" ? raw.name : typeof raw?.NAME === "string" ? raw.NAME : "";
      if (!code) return [];
      return [{
        code,
        diskMb: finiteNumber(raw.QUOTA ?? raw.quota),
        bandwidthMb: finiteNumber(raw.BWLIMIT ?? raw.bwlimit),
        maxFtpAccounts: finiteNumber(raw.MAXFTP ?? raw.maxftp),
        maxEmailAccounts: finiteNumber(raw.MAXPOP ?? raw.maxpop),
        maxDatabases: finiteNumber(raw.MAXSQL ?? raw.maxsql),
      }];
    });
  }

  async provisionAccount(req: HostingAccountRequest): Promise<HostingAccountResult> {
    if (!req.planCode.trim()) return { success: false, errorMessage: "A WHM hosting plan code is required." };
    const domain = req.domain.trim().toLowerCase();
    const username = deriveUsername(domain, req.idempotencyKey);

    try {
      const body = await this.call("createacct", {
        username,
        domain,
        plan: req.planCode,
        contactemail: req.customerEmail,
        dkim: 1,
        spf: 1,
      });
      const data = body.data ?? {};
      const nameservers = [data.nameserver, data.nameserver2, data.nameserver3, data.nameserver4].filter((value): value is string => typeof value === "string" && value.length > 0);
      return {
        success: true,
        providerAccountId: username,
        nameservers,
        serverIp: typeof data.ip === "string" ? data.ip : undefined,
        planCode: typeof data.package === "string" ? data.package : req.planCode,
      };
    } catch (creationError) {
      try {
        const existing = await this.getAccountSummary(username);
        if (existing && existing.domain.toLowerCase() === domain) {
          return { success: true, providerAccountId: username, serverIp: existing.serverIp ?? undefined, planCode: existing.planCode ?? req.planCode };
        }
      } catch {
        // Preserve the original create error below.
      }
      return { success: false, errorMessage: creationError instanceof Error ? creationError.message : "WHM account creation failed." };
    }
  }

  async getAccountSummary(providerAccountId: string): Promise<HostingAccountSummary | null> {
    try {
      const body = await this.call("accountsummary", { user: providerAccountId });
      const accounts = Array.isArray(body.data?.acct) ? body.data!.acct : [];
      const account = accounts[0];
      if (!account) return null;

      let bandwidthUsedMb: number | null = null;
      try {
        const escapedUser = providerAccountId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const bandwidth = await this.call("showbw", { searchtype: "user", search: `^${escapedUser}$`, showres: process.env.WHM_USERNAME });
        const rows = Array.isArray(bandwidth.data?.acct) ? bandwidth.data!.acct : [];
        const usage = rows.find((candidate: any) => String(candidate?.user ?? "") === providerAccountId) ?? rows[0];
        bandwidthUsedMb = usage ? bytesToMb(usage.totalbytes) : null;
      } catch {
        // Account identity/status remains authoritative even if usage reporting
        // is temporarily unavailable. Health checks surface persistent ACL loss.
      }

      return {
        username: String(account.user ?? account.username ?? providerAccountId),
        domain: String(account.domain ?? ""),
        planCode: typeof account.plan === "string" ? account.plan : null,
        suspended: String(account.suspended ?? "0") === "1",
        diskUsedMb: mbFromPossiblyHumanValue(account.diskused),
        diskLimitMb: mbFromPossiblyHumanValue(account.disklimit),
        bandwidthUsedMb,
        email: typeof account.email === "string" ? account.email : null,
        serverIp: typeof account.ip === "string" ? account.ip : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("not found") || message.includes("no account") || message.includes("does not exist")) return null;
      throw error;
    }
  }

  async createControlPanelSession(providerAccountId: string) {
    const body = await this.call("create_user_session", { user: providerAccountId, service: "cpaneld" });
    const url = body.data?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("WHM did not return a secure cPanel session URL.");
    const expirySeconds = Number(body.data?.expires);
    return { url, expiresAt: Number.isFinite(expirySeconds) ? new Date(expirySeconds * 1000) : null };
  }

  async suspendAccount(providerAccountId: string, reason = "GetSawa service suspended") {
    await this.call("suspendacct", { user: providerAccountId, reason });
  }

  async unsuspendAccount(providerAccountId: string) {
    await this.call("unsuspendacct", { user: providerAccountId });
  }

  async terminateAccount(providerAccountId: string) {
    await this.call("removeacct", { user: providerAccountId });
  }
}

export class UnconfiguredHostingProvider implements HostingProvider {
  readonly name = "none";
  isConfigured() { return false; }
  async healthCheck(): Promise<HostingProviderHealth> { return { ok: false, provider: this.name, message: "cPanel/WHM hosting is not configured.", plans: [] }; }
  async listPlans(): Promise<HostingPlan[]> { return []; }
  async provisionAccount(): Promise<HostingAccountResult> { return { success: false, errorMessage: "No hosting provider is configured yet." }; }
  async getAccountSummary(): Promise<HostingAccountSummary | null> { return null; }
  async createControlPanelSession(): Promise<{ url: string; expiresAt: Date | null }> { throw new Error("No hosting provider is configured."); }
  async suspendAccount(): Promise<void> { throw new Error("No hosting provider is configured."); }
  async unsuspendAccount(): Promise<void> { throw new Error("No hosting provider is configured."); }
  async terminateAccount(): Promise<void> { throw new Error("No hosting provider is configured."); }
}

export function getHostingProvider(): HostingProvider {
  return envConfigured() ? new CpanelWhmHostingProvider() : new UnconfiguredHostingProvider();
}
