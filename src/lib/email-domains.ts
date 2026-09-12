import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import type { DnsRecordResult } from "@/lib/providers/domains/DomainProvider";
import { getEmailProvider, type EmailDnsRecord } from "@/lib/providers/email/EmailProvider";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { logAudit } from "@/lib/audit";

interface EmailDomainRow {
  id: string;
  user_id: string;
  domain_id: string;
  provider_name: string;
  provider_domain: string;
  cluster: "A" | "B";
  status: string;
  dns_status: unknown;
  last_dns_checked_at: Date | null;
}

interface DohAnswer { name?: string; type?: number; data?: string; }
interface DohResponse { Status?: number; Answer?: DohAnswer[]; Comment?: string; }

function normalizeHost(host: string, domain: string) {
  const value = host.trim().toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value === "@" || value === normalizedDomain) return normalizedDomain;
  return value.endsWith(`.${normalizedDomain}`) ? value : `${value}.${normalizedDomain}`;
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isRoot(record: DnsRecordResult, domain: string) {
  return normalizeHost(record.host, domain) === domain.toLowerCase();
}

function isNameSiloManagedDns(nameservers: string[]) {
  const normalized = nameservers.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  return normalized.length >= 2 && normalized.every((value) => value.endsWith(".dnsowl.com") || value === "dnsowl.com");
}

function recordMatches(record: DnsRecordResult, required: EmailDnsRecord, domain: string) {
  if (record.type !== required.type) return false;
  if (normalizeHost(record.host, domain) !== normalizeHost(required.host, domain)) return false;
  if (normalizeValue(record.value) !== normalizeValue(required.value)) return false;
  if (required.type === "MX" && Number(record.priority ?? 0) !== Number(required.priority ?? 0)) return false;
  return true;
}

async function resolvePublic(name: string, type: "MX" | "CNAME" | "TXT"): Promise<string[]> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/dns-json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Public DNS resolver returned HTTP ${response.status}.`);
    const body = await response.json() as DohResponse;
    if (body.Status !== 0 && body.Status !== 3) throw new Error(body.Comment || `Public DNS resolver returned status ${body.Status}.`);
    return (body.Answer ?? []).map((answer) => String(answer.data ?? "")).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

function publicMxMatches(answer: string, required: EmailDnsRecord) {
  const match = answer.trim().match(/^(\d+)\s+(.+)$/);
  if (!match) return false;
  return Number(match[1]) === Number(required.priority ?? 0) && normalizeValue(match[2]) === normalizeValue(required.value);
}

function publicCnameMatches(answer: string, required: EmailDnsRecord) {
  return normalizeValue(answer) === normalizeValue(required.value);
}

function normalizeTxtAnswer(answer: string) {
  return answer.replace(/^"|"$/g, "").replace(/"\s+"/g, "").trim();
}

async function publicDnsState(domain: string, required: EmailDnsRecord[]) {
  const requiredMx = required.filter((record) => record.type === "MX");
  const requiredCname = required.filter((record) => record.type === "CNAME");
  const requiredSpf = required.find((record) => record.type === "TXT" && record.purpose === "spf") ?? null;
  try {
    const [mxAnswers, cnameAnswers, txtAnswers] = await Promise.all([
      resolvePublic(domain, "MX"),
      Promise.all(requiredCname.map((record) => resolvePublic(normalizeHost(record.host, domain), "CNAME"))).then((groups) => groups.flat()),
      resolvePublic(domain, "TXT"),
    ]);
    const mxReady = requiredMx.every((record) => mxAnswers.some((answer) => publicMxMatches(answer, record)));
    const cnameReady = requiredCname.every((record) => cnameAnswers.some((answer) => publicCnameMatches(answer, record)));
    const spfRecords = txtAnswers.map(normalizeTxtAnswer).filter((value) => value.toLowerCase().startsWith("v=spf1"));
    const spfReady = Boolean(requiredSpf) && spfRecords.some((value) => value.toLowerCase().includes("include:_spf.hostedemail.com"));
    return { mxReady, cnameReady, spfReady, spfNeedsManualMerge: Boolean(requiredSpf) && spfRecords.length > 0 && !spfReady, error: null as string | null };
  } catch (error) {
    return { mxReady: false, cnameReady: false, spfReady: false, spfNeedsManualMerge: false, error: error instanceof Error ? error.message : "Public DNS verification failed." };
  }
}

async function getEmailDomainForUser(userId: string, domainId: string) {
  const rows = await prisma.$queryRaw<EmailDomainRow[]>`
    SELECT eds.* FROM "email_domain_services" eds
    JOIN "Domain" d ON d."id"=eds."domain_id"
    WHERE eds."domain_id"=${domainId} AND eds."user_id"=${userId} AND d."userId"=${userId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Business email has not been provisioned for this domain.");
  return row;
}

export async function inspectEmailDns(userId: string, domainId: string) {
  const emailDomain = await getEmailDomainForUser(userId, domainId);
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId }, select: { id: true, name: true, providerName: true } });
  if (!domain) throw new Error("Domain not found.");
  const emailOperational = await getEmailOperationalState();
  if (!emailOperational.verified) throw new Error(emailOperational.reason || "OpenSRS Hosted Email is not operational.");

  const emailProvider = getEmailProvider();
  const required = emailProvider.requiredDnsRecords(domain.name);
  const domainProvider = getDomainProvider();
  if (!domainProvider.isConfigured()) throw new Error("The domain provider is not configured.");

  const info = await domainProvider.getDomainInfo(domain.name);
  const managedHere = domain.providerName === domainProvider.name && isNameSiloManagedDns(info.nameservers);
  let configuredRecords: DnsRecordResult[] = [];
  if (managedHere) configuredRecords = await domainProvider.listDnsRecords(domain.name);
  const configuredMx = required.filter((record) => record.type === "MX").every((needed) => configuredRecords.some((record) => recordMatches(record, needed, domain.name)));
  const configuredCname = required.filter((record) => record.type === "CNAME").every((needed) => configuredRecords.some((record) => recordMatches(record, needed, domain.name)));

  const publicState = await publicDnsState(domain.name, required);
  const routingReady = publicState.mxReady && publicState.cnameReady;
  const state = {
    authoritativeDnsManagedByGetSawa: managedHere,
    nameservers: info.nameservers,
    requiredRecords: required,
    configuredAtManagedProvider: managedHere ? { mxReady: configuredMx, cnameReady: configuredCname } : null,
    mxReady: publicState.mxReady,
    cnameReady: publicState.cnameReady,
    spfReady: publicState.spfReady,
    spfNeedsManualMerge: publicState.spfNeedsManualMerge,
    routingReady,
    publicCheckError: publicState.error,
    checkedAt: new Date(),
  };

  await prisma.$executeRaw`
    UPDATE "email_domain_services" SET
      "status"=${routingReady ? "ACTIVE" : "DNS_PENDING"},
      "dns_status"=${JSON.stringify(state)}::jsonb,
      "last_dns_checked_at"=CURRENT_TIMESTAMP,
      "updated_at"=CURRENT_TIMESTAMP
    WHERE "id"=${emailDomain.id}
  `;
  return { domainId, domainName: domain.name, ...state };
}

/**
 * Explicitly applies OpenSRS mail routing only when NameSilo/DNSOwl is actually
 * authoritative. Existing root MX and mail-host A/AAAA/CNAME records are
 * replaced only after the caller supplies explicit confirmation. Existing SPF
 * is never overwritten: when one exists without OpenSRS, the customer receives
 * a manual-merge requirement instead.
 */
export async function applyEmailDnsCutover(params: { userId: string; domainId: string; confirmed: boolean }) {
  if (!params.confirmed) throw new Error("Confirm the email DNS cutover before replacing existing mail-routing records.");
  await getEmailDomainForUser(params.userId, params.domainId);
  const domain = await prisma.domain.findFirst({ where: { id: params.domainId, userId: params.userId }, select: { id: true, name: true, providerName: true } });
  if (!domain) throw new Error("Domain not found.");

  const emailOperational = await getEmailOperationalState();
  if (!emailOperational.verified) throw new Error(emailOperational.reason || "OpenSRS Hosted Email is not operational.");
  const emailProvider = getEmailProvider();
  const required = emailProvider.requiredDnsRecords(domain.name);
  const domainProvider = getDomainProvider();
  if (!domainProvider.isConfigured()) throw new Error("The domain provider is not configured.");
  const info = await domainProvider.getDomainInfo(domain.name);
  if (domain.providerName !== domainProvider.name || !isNameSiloManagedDns(info.nameservers)) {
    throw new Error("This domain uses external DNS. GetSawa will not edit inactive NameSilo DNS records; add the displayed OpenSRS records at the authoritative DNS provider instead.");
  }

  let records = await domainProvider.listDnsRecords(domain.name);
  const requiredMx = required.filter((record) => record.type === "MX");
  const requiredCname = required.filter((record) => record.type === "CNAME");
  const requiredSpf = required.find((record) => record.type === "TXT" && record.purpose === "spf") ?? null;

  for (const record of records.filter((record) => record.type === "MX" && isRoot(record, domain.name) && !requiredMx.some((needed) => recordMatches(record, needed, domain.name)))) {
    await domainProvider.deleteDnsRecord(domain.name, record.providerRecordId);
  }
  records = await domainProvider.listDnsRecords(domain.name);
  for (const needed of requiredMx) {
    if (!records.some((record) => recordMatches(record, needed, domain.name))) {
      await domainProvider.createDnsRecord(domain.name, { type: "MX", host: needed.host, value: needed.value, priority: needed.priority, ttl: 3600 });
    }
  }

  records = await domainProvider.listDnsRecords(domain.name);
  for (const needed of requiredCname) {
    const neededHost = normalizeHost(needed.host, domain.name);
    for (const conflict of records.filter((record) => ["A", "AAAA", "CNAME"].includes(record.type) && normalizeHost(record.host, domain.name) === neededHost && !recordMatches(record, needed, domain.name))) {
      await domainProvider.deleteDnsRecord(domain.name, conflict.providerRecordId);
    }
    records = await domainProvider.listDnsRecords(domain.name);
    if (!records.some((record) => recordMatches(record, needed, domain.name))) {
      await domainProvider.createDnsRecord(domain.name, { type: "CNAME", host: needed.host, value: needed.value, ttl: 3600 });
    }
  }

  records = await domainProvider.listDnsRecords(domain.name);
  if (requiredSpf) {
    const rootSpf = records.filter((record) => record.type === "TXT" && isRoot(record, domain.name) && record.value.trim().toLowerCase().startsWith("v=spf1"));
    if (rootSpf.length === 0) {
      await domainProvider.createDnsRecord(domain.name, { type: "TXT", host: requiredSpf.host, value: requiredSpf.value, ttl: 3600 });
    }
  }

  const result = await inspectEmailDns(params.userId, params.domainId);
  await logAudit({
    actorId: params.userId,
    action: "email.dns_cutover_applied",
    resource: "domain",
    resourceId: params.domainId,
    metadata: { domain: domain.name, spfNeedsManualMerge: result.spfNeedsManualMerge, routingReady: result.routingReady, publicCheckError: result.publicCheckError },
  });
  return result;
}
