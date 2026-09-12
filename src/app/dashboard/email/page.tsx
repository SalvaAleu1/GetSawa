"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MailboxLive = {
  address: string;
  status: string;
  quotaBytes: number | null;
  usedBytes: number | null;
  aliases: string[];
  forwardRecipients: string[];
  deliveryForward: boolean;
  lastLoginAt: string | null;
};

type EmailService = {
  id: string;
  status: string;
  address: string;
  productName: string;
  billingCycle: string;
  domainId: string | null;
  domainName: string | null;
  metadata: Record<string, unknown> | null;
  billing: null | {
    status: string | null;
    currentPeriodEnd: string | null;
    nextBillingAt: string | null;
    graceUntil: string | null;
    autoRenew: boolean | null;
    cancelAtPeriodEnd: boolean | null;
    amountCents: number | null;
    currency: string | null;
  };
  dns: null | { status: string | null; detail: unknown; lastCheckedAt: string | null };
  live: MailboxLive | null;
  liveError: string | null;
};

type EmailData = {
  provider: {
    configured: boolean;
    verified: boolean;
    reason: string | null;
    cluster: "A" | "B" | null;
    webmailUrl: string | null;
    imapSmtpHost: string | null;
    lastTestedAt: string | null;
  };
  services: EmailService[];
};

type DnsState = {
  authoritativeDnsManagedByGetSawa: boolean;
  nameservers: string[];
  requiredRecords: Array<{ type: string; host: string; value: string; priority?: number; purpose: string }>;
  mxReady: boolean;
  cnameReady: boolean;
  spfReady: boolean;
  spfNeedsManualMerge: boolean;
  routingReady: boolean;
};

function money(cents: number | null, currency = "USD") {
  if (cents == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
}
function bytes(value: number | null) {
  if (value == null) return "—";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  return `${(value / 1024 ** 2).toFixed(0)} MB`;
}
function listInput(values: string[] | undefined) { return (values ?? []).join(", "); }
function statusClass(status: string) {
  if (status === "ACTIVE") return "badge-success";
  if (["SUSPENDED", "SUSPENSION_PENDING", "PAST_DUE", "DNS_PENDING"].includes(status)) return "badge-warning";
  if (["TERMINATED", "PROVIDER_ERROR", "EXPIRED", "CANCELLED"].includes(status)) return "badge-danger";
  return "badge-neutral";
}

export default function BusinessEmailPage() {
  const [data, setData] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [forwards, setForwards] = useState<Record<string, string>>({});
  const [dnsStates, setDnsStates] = useState<Record<string, DnsState>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/email", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load business email.");
      setData(body.data ?? body);
      const services: EmailService[] = (body.data ?? body).services ?? [];
      setAliases((current) => Object.fromEntries(services.map((service) => [service.id, current[service.id] ?? listInput(service.live?.aliases)])));
      setForwards((current) => Object.fromEntries(services.map((service) => [service.id, current[service.id] ?? listInput(service.live?.forwardRecipients)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load business email.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const providerHost = data?.provider.imapSmtpHost ?? "—";
  const activeCount = useMemo(() => data?.services.filter((service) => service.status === "ACTIVE").length ?? 0, [data]);

  async function openWebmail(serviceId: string) {
    setBusy(`webmail:${serviceId}`); setError("");
    try {
      const response = await fetch(`/api/dashboard/email/${serviceId}/session`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create a webmail session.");
      if (!body.url) throw new Error("OpenSRS did not return a webmail session URL.");
      window.location.href = body.url;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open webmail.");
      setBusy("");
    }
  }

  async function changePassword(serviceId: string) {
    const password = passwords[serviceId] || "";
    setBusy(`password:${serviceId}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/email/${serviceId}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to change mailbox password.");
      setPasswords((current) => ({ ...current, [serviceId]: "" }));
      setNotice("Mailbox password changed. GetSawa did not store the password.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change mailbox password."); }
    finally { setBusy(""); }
  }

  async function saveSettings(serviceId: string) {
    const aliasValues = (aliases[serviceId] || "").split(",").map((value) => value.trim()).filter(Boolean);
    const forwardValues = (forwards[serviceId] || "").split(",").map((value) => value.trim()).filter(Boolean);
    setBusy(`settings:${serviceId}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/email/${serviceId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliases: aliasValues, forwardRecipients: forwardValues }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update mailbox settings.");
      setNotice(body.message || "Mailbox settings updated.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update mailbox settings."); }
    finally { setBusy(""); }
  }

  async function setAutoRenew(serviceId: string, enabled: boolean) {
    if (!enabled && !window.confirm("Turn off automatic renewal? The mailbox will remain active through the paid period and will then be suspended unless renewed.")) return;
    setBusy(`renew:${serviceId}`); setError("");
    try {
      const response = await fetch(`/api/dashboard/email/${serviceId}/auto-renew`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update renewal settings.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update renewal settings."); }
    finally { setBusy(""); }
  }

  async function checkDns(domainId: string) {
    setBusy(`dns:${domainId}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/email/domains/${domainId}/dns`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to verify email DNS.");
      setDnsStates((current) => ({ ...current, [domainId]: body.data ?? body }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify email DNS."); }
    finally { setBusy(""); }
  }

  async function applyDns(domainId: string) {
    if (!window.confirm("This will replace the domain's current root MX records and conflicting mail-host A/AAAA/CNAME records with OpenSRS mail routing. Existing SPF is never overwritten. Continue?")) return;
    setBusy(`dns:${domainId}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/email/domains/${domainId}/dns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to apply email DNS.");
      const state = body.data ?? body;
      setDnsStates((current) => ({ ...current, [domainId]: state }));
      setNotice(state.spfNeedsManualMerge ? "Mail routing was applied. Your existing SPF record must be merged manually to include OpenSRS without removing other approved senders." : "OpenSRS mail routing records were applied successfully.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to apply email DNS."); }
    finally { setBusy(""); }
  }

  if (loading) return <main className="max-w-6xl"><h1 className="text-2xl font-semibold">Business Email</h1><p className="mt-4 text-sm text-ink/60">Loading mailboxes…</p></main>;
  if (!data) return <main className="max-w-6xl"><h1 className="text-2xl font-semibold">Business Email</h1><div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error || "Business email could not be loaded."}</div></main>;

  return <main className="max-w-6xl space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-medium">My Services</p><h1 className="text-3xl font-bold">Business Email</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">Manage provider-backed mailboxes, secure webmail access, aliases, forwarding, DNS and renewals.</p></div>
      <Link href="/products/email" className="btn-primary">Add mailbox</Link>
    </div>

    <section className="grid gap-4 sm:grid-cols-3">
      <Metric label="Mailboxes" value={String(data.services.length)} />
      <Metric label="Active" value={String(activeCount)} />
      <Metric label="Provider" value={data.provider.verified ? `OpenSRS · Cluster ${data.provider.cluster}` : "Not verified"} />
    </section>

    {!data.provider.verified ? <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">Live mailbox management is unavailable until the current OpenSRS credentials pass the provider verification gate.{data.provider.reason ? ` ${data.provider.reason}` : ""}</div> : null}
    {error ? <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {notice ? <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

    {data.services.length === 0 ? <div className="empty-state"><h2 className="text-xl font-bold">No business email mailboxes yet</h2><p className="mt-2 max-w-lg text-sm text-ink/55">A mailbox appears here only after payment and successful OpenSRS provisioning.</p><Link href="/products/email" className="btn-primary mt-5">View email plans</Link></div> :
      <div className="space-y-6">{data.services.map((service) => {
        const used = service.live?.usedBytes ?? null;
        const quota = service.live?.quotaBytes ?? null;
        const usagePercent = used != null && quota ? Math.min(100, Math.max(0, Math.round((used / quota) * 100))) : null;
        const metadata = service.metadata && typeof service.metadata === "object" ? service.metadata : {};
        const passwordResetRequired = metadata.passwordResetRequired === true;
        const dnsState = service.domainId ? dnsStates[service.domainId] : undefined;
        return <article key={service.id} className="card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{service.address}</h2><span className={statusClass(service.status)}>{service.status.replaceAll("_", " ")}</span>{passwordResetRequired ? <span className="badge-warning">Set password</span> : null}</div><p className="mt-1 text-sm text-ink/55">{service.productName} · {service.billingCycle.toLowerCase()}</p>{service.liveError ? <p className="mt-2 text-xs text-danger">Live provider check: {service.liveError}</p> : null}</div>
            <button type="button" className="btn-secondary" disabled={busy === `webmail:${service.id}` || service.status !== "ACTIVE" || !data.provider.verified || passwordResetRequired} onClick={() => void openWebmail(service.id)}>{busy === `webmail:${service.id}` ? "Opening…" : "Open webmail"}</button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Storage used" value={used == null ? "Unavailable" : `${bytes(used)} / ${bytes(quota)}`} />
            <Metric label="Last login" value={date(service.live?.lastLoginAt ?? null)} />
            <Metric label="Period ends" value={date(service.billing?.currentPeriodEnd ?? null)} />
            <Metric label="Renewal" value={service.billing ? money(service.billing.amountCents, service.billing.currency || "USD") : "One-time"} />
          </div>
          {usagePercent != null ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-border"><div className="h-full bg-current" style={{ width: `${usagePercent}%` }} /></div> : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-border p-4">
              <h3 className="font-semibold">Mailbox password</h3>
              <p className="mt-1 text-xs leading-5 text-ink/50">12–54 printable characters; no spaces or double quotes. The password is sent directly to OpenSRS and is never stored by GetSawa.</p>
              <div className="mt-3 flex gap-2"><input type="password" className="input" value={passwords[service.id] || ""} onChange={(event) => setPasswords((current) => ({ ...current, [service.id]: event.target.value }))} placeholder="New mailbox password" autoComplete="new-password" /><button type="button" className="btn-secondary shrink-0" disabled={busy === `password:${service.id}` || !data.provider.verified} onClick={() => void changePassword(service.id)}>{busy === `password:${service.id}` ? "Saving…" : "Set password"}</button></div>
            </section>

            <section className="rounded-xl border border-border p-4">
              <h3 className="font-semibold">Mail client settings</h3>
              <div className="mt-2 space-y-1 text-sm text-ink/60"><p>Username: <strong>{service.address}</strong></p><p>Server: <strong>{providerHost}</strong></p><p>IMAP SSL: <strong>993</strong></p><p>SMTP SSL: <strong>465</strong> · SMTP TLS: <strong>587</strong></p></div>
            </section>

            <section className="rounded-xl border border-border p-4">
              <h3 className="font-semibold">Aliases & forwarding</h3>
              <label className="mt-3 block text-xs font-medium text-ink/55">Aliases on {service.domainName || "this domain"}</label>
              <input className="input mt-1" value={aliases[service.id] || ""} onChange={(event) => setAliases((current) => ({ ...current, [service.id]: event.target.value }))} placeholder="sales, support" />
              <label className="mt-3 block text-xs font-medium text-ink/55">Forward to</label>
              <input className="input mt-1" value={forwards[service.id] || ""} onChange={(event) => setForwards((current) => ({ ...current, [service.id]: event.target.value }))} placeholder="person@example.com" />
              <p className="mt-2 text-xs leading-5 text-ink/45">Separate multiple values with commas. External forwarding is not considered active until each recipient completes OpenSRS opt-in confirmation.</p>
              <button type="button" className="btn-secondary mt-3" disabled={busy === `settings:${service.id}` || service.status !== "ACTIVE" || !data.provider.verified} onClick={() => void saveSettings(service.id)}>{busy === `settings:${service.id}` ? "Saving…" : "Save mailbox settings"}</button>
            </section>

            <section className="rounded-xl border border-border p-4">
              <h3 className="font-semibold">Renewal</h3>
              {service.billing ? <div className="mt-2 space-y-1 text-sm text-ink/60"><p>Automatic renewal: {service.billing.autoRenew ? "Enabled" : "Disabled"}</p><p>Next invoice check: {date(service.billing.nextBillingAt)}</p>{service.billing.graceUntil ? <p className="text-amber-700">Payment grace until {date(service.billing.graceUntil)}</p> : null}{service.billing.cancelAtPeriodEnd ? <p className="text-amber-700">Scheduled to end after the current paid period.</p> : null}<button type="button" className="btn-secondary mt-3" disabled={busy === `renew:${service.id}`} onClick={() => void setAutoRenew(service.id, !service.billing?.autoRenew)}>{busy === `renew:${service.id}` ? "Saving…" : service.billing.autoRenew ? "Turn off auto-renew" : "Re-enable auto-renew"}</button></div> : <p className="mt-2 text-sm text-ink/60">This mailbox does not have a recurring subscription.</p>}
            </section>
          </div>

          {service.domainId ? <section className="mt-5 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Email DNS · {service.domainName}</h3><p className="mt-1 text-xs leading-5 text-ink/50">Provider provisioning happens first. Mail routing changes only after you explicitly approve them.</p></div><div className="flex gap-2"><button type="button" className="btn-secondary" disabled={busy === `dns:${service.domainId}`} onClick={() => void checkDns(service.domainId!)}>{busy === `dns:${service.domainId}` ? "Checking…" : "Check DNS"}</button>{dnsState?.authoritativeDnsManagedByGetSawa && !dnsState.routingReady ? <button type="button" className="btn-primary" disabled={busy === `dns:${service.domainId}`} onClick={() => void applyDns(service.domainId!)}>Apply email DNS</button> : null}</div></div>
            {dnsState ? <div className="mt-4"><div className="flex flex-wrap gap-2"><span className={dnsState.routingReady ? "badge-success" : "badge-warning"}>{dnsState.routingReady ? "Mail routing configured" : "Mail routing incomplete"}</span><span className={dnsState.spfReady ? "badge-success" : "badge-neutral"}>{dnsState.spfReady ? "SPF includes OpenSRS" : dnsState.spfNeedsManualMerge ? "SPF merge required" : "SPF not configured"}</span></div>{!dnsState.authoritativeDnsManagedByGetSawa ? <p className="mt-3 text-sm text-amber-700">This domain uses external nameservers. Add the records below at the authoritative DNS provider; GetSawa will not edit inactive NameSilo DNS.</p> : null}<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Host</th><th className="py-2 pr-3">Value</th><th className="py-2">Priority</th></tr></thead><tbody>{dnsState.requiredRecords.map((record, index) => <tr key={`${record.type}-${index}`} className="border-b last:border-0"><td className="py-2 pr-3 font-semibold">{record.type}</td><td className="py-2 pr-3">{record.host}</td><td className="py-2 pr-3 break-all">{record.value}</td><td className="py-2">{record.priority ?? "—"}</td></tr>)}</tbody></table></div></div> : <p className="mt-3 text-sm text-ink/50">Check DNS to compare the current managed records with the OpenSRS routing requirements.</p>}
          </section> : null}
        </article>;
      })}</div>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p><p className="mt-2 break-words font-semibold">{value}</p></div>;
}
