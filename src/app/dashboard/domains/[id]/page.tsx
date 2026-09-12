"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DnsManager } from "@/components/domain/DnsManager";

interface DomainDetail {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  registeredAt: string | null;
  autoRenew: boolean;
  isLocked: boolean;
  privacyEnabled: boolean;
  isPremium: boolean;
  nameservers: string[];
  lifecycle: string;
  daysUntilExpiry: number | null;
  renewalPriceCents: number;
  transferPriceCents: number | null;
  currency: string;
  wholesaleProtected: boolean;
  providerName: string;
  recentOrders: Array<{
    id: string;
    description: string;
    totalCents: number;
    provisioningStatus: string;
    createdAt: string;
    order: { orderNumber: string; status: string; createdAt: string };
  }>;
  websiteProjects: Array<{ id: string; name: string; slug: string; status: string; domainConnectionStatus: string | null; updatedAt: string }>;
}

type Tab = "overview" | "dns" | "nameservers" | "activity";

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const loadDomain = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/domains/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the domain.");
      setDomain(data.domain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the domain.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDomain(); }, [loadDomain]);

  async function syncRegistrar() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registrar sync failed.");
      setSyncedAt(data.syncedAt);
      await loadDomain();
    } catch (err) { setError(err instanceof Error ? err.message : "Registrar sync failed."); } finally { setBusy(false); }
  }

  async function toggleLock() {
    if (!domain) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${id}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: !domain.isLocked }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the domain lock.");
      await loadDomain();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update the domain lock."); } finally { setBusy(false); }
  }

  async function toggleAutoRenew() {
    if (!domain) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${id}/autorenew`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoRenew: !domain.autoRenew }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update auto-renew.");
      await loadDomain();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update auto-renew."); } finally { setBusy(false); }
  }

  if (loading) return <div className="skeleton h-96" />;
  if (!domain) return <div className="rounded-2xl border border-danger/20 bg-danger/5 p-5 text-danger">{error || "Domain not found."}</div>;

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/dashboard/domains" className="text-sm font-semibold text-brand-600 hover:text-brand-700">← Domain portfolio</Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="page-heading">{domain.name}</h1>
            <span className={domain.status === "ACTIVE" ? "badge-success" : domain.status === "EXPIRED" || domain.status === "REGISTRATION_FAILED" ? "badge-danger" : "badge-warning"}>{domain.status.replace(/_/g, " ")}</span>
            {domain.isPremium ? <span className="badge-warning">Premium</span> : null}
          </div>
          <p className="page-subtitle">Registrar: {domain.providerName}. Reconcile registrar state before making time-sensitive lifecycle or DNS changes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={syncRegistrar} disabled={busy} className="btn-secondary">{busy ? "Working…" : "Sync registrar"}</button>
          <Link href="/domains/search" className="btn-primary">Register another</Link>
        </div>
      </div>

      {syncedAt ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">Registrar state reconciled at {new Date(syncedAt).toLocaleString()}.</div> : null}
      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
      <LifecycleAlert domain={domain} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Expiry" value={domain.expiresAt ? new Date(domain.expiresAt).toLocaleDateString() : "Pending"} sub={domain.daysUntilExpiry == null ? "Registrar date unavailable" : domain.daysUntilExpiry < 0 ? `${Math.abs(domain.daysUntilExpiry)} days overdue` : `${domain.daysUntilExpiry} days remaining`} />
        <Summary label="Auto-renew" value={domain.autoRenew ? "Enabled" : "Disabled"} sub={domain.autoRenew ? "Renewal protection active" : "Manual renewal required"} />
        <Summary label="Domain lock" value={domain.isLocked ? "Locked" : "Unlocked"} sub={domain.isLocked ? "Transfer protection active" : "Transfer-out risk increased"} />
        <Summary label="WHOIS privacy" value={domain.privacyEnabled ? "Enabled" : "Disabled"} sub={domain.privacyEnabled ? "Registrant details protected" : "Availability depends on TLD/provider"} />
      </div>

      <div className="overflow-x-auto border-b border-border">
        <div className="flex min-w-max gap-1">
          {(["overview", "dns", "nameservers", "activity"] as Tab[]).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${tab === item ? "border-brand-500 text-brand-600" : "border-transparent text-ink/50 hover:text-ink"}`}>{item === "dns" ? "DNS" : item}</button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="panel divide-y divide-border">
            <Row label="Registered" value={domain.registeredAt ? new Date(domain.registeredAt).toLocaleDateString() : "Not confirmed"} />
            <Row label="Expires" value={domain.expiresAt ? new Date(domain.expiresAt).toLocaleDateString() : "Not confirmed"} />
            <Row label="Current renewal estimate" value={money(domain.renewalPriceCents, domain.currency)} />
            <Row label="Wholesale-cost protection" value={domain.wholesaleProtected ? "Active" : "Wholesale snapshot incomplete"} />
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Auto-renew</p><p className="text-xs text-ink/50">Registrar setting and GetSawa state are updated together.</p></div><button onClick={toggleAutoRenew} disabled={busy} className={domain.autoRenew ? "btn-secondary" : "btn-primary"}>{domain.autoRenew ? "Disable auto-renew" : "Enable auto-renew"}</button></div>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Transfer lock</p><p className="text-xs text-ink/50">Keep locked unless you intentionally need to transfer the domain away.</p></div><button onClick={toggleLock} disabled={busy} className={domain.isLocked ? "btn-secondary" : "btn-primary"}>{domain.isLocked ? "Unlock domain" : "Lock domain"}</button></div>
          </section>
          <section className="panel p-5"><p className="eyebrow">Connected services</p><h2 className="section-heading mt-2">Websites using this domain</h2>{domain.websiteProjects.length === 0 ? <p className="mt-4 text-sm text-ink/55">No GetSawa website project is connected to this domain.</p> : <div className="mt-4 space-y-3">{domain.websiteProjects.map((project) => <Link key={project.id} href="/dashboard/websites" className="block rounded-xl border border-border p-4 hover:bg-paper"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{project.name}</p><span className="badge-neutral">{project.status}</span></div><p className="mt-1 text-xs text-ink/50">Connection: {project.domainConnectionStatus || "Not configured"}</p></Link>)}</div>}</section>
        </div>
      ) : null}

      {tab === "dns" ? <DnsManager domainId={id} /> : null}
      {tab === "nameservers" ? <NameserversTab domainId={id} current={domain.nameservers} onChange={loadDomain} /> : null}
      {tab === "activity" ? <ActivityTab domain={domain} /> : null}
    </div>
  );
}

function LifecycleAlert({ domain }: { domain: DomainDetail }) {
  if (domain.lifecycle === "healthy") return null;
  const critical = domain.lifecycle === "expired" || domain.lifecycle === "critical" || domain.lifecycle === "attention";
  return <div className={`rounded-2xl border p-4 ${critical ? "border-danger/25 bg-danger/5" : "border-amber-300 bg-amber-50"}`}><p className={`font-semibold ${critical ? "text-danger" : "text-amber-700"}`}>{domain.lifecycle === "expired" ? "Domain has expired" : domain.lifecycle === "critical" ? "Expiry is very close" : domain.lifecycle === "warning" ? "Domain expires within 30 days" : domain.lifecycle === "attention" ? "Domain needs operational attention" : "Registrar lifecycle is still pending"}</p><p className="mt-1 text-sm text-ink/60">{domain.autoRenew ? "Auto-renew is enabled, but payment and registrar readiness still need to succeed at renewal time." : "Auto-renew is disabled. Review renewal before the expiration deadline."}</p></div>;
}

function Summary({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="metric-card"><p className="eyebrow">{label}</p><p className="mt-2 text-lg font-bold">{value}</p><p className="mt-1 text-xs text-ink/45">{sub}</p></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-ink/55">{label}</span><span className="font-semibold">{value}</span></div>; }

function ActivityTab({ domain }: { domain: DomainDetail }) {
  return <section className="panel"><div className="border-b border-border p-5"><h2 className="section-heading">Recent domain commerce activity</h2><p className="mt-1 text-sm text-ink/50">Orders linked to this domain. Registrar and DNS operations are preserved separately in audit history.</p></div><div className="divide-y divide-border">{domain.recentOrders.length === 0 ? <p className="p-5 text-sm text-ink/55">No linked order activity is available yet.</p> : domain.recentOrders.map((item) => <div key={item.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.description}</p><p className="mt-1 text-xs text-ink/45">{item.order.orderNumber} · {new Date(item.createdAt).toLocaleString()}</p></div><div className="text-left sm:text-right"><p className="font-semibold">{money(item.totalCents, domain.currency)}</p><p className="text-xs text-ink/45">{item.order.status.replace(/_/g, " ")} · {item.provisioningStatus}</p></div></div>)}</div></section>;
}

function NameserversTab({ domainId, current, onChange }: { domainId: string; current: string[]; onChange: () => Promise<void> | void }) {
  const [ns, setNs] = useState<string[]>(current.length ? current : ["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setNs(current.length ? current : ["", ""]); }, [current]);

  async function handleSave() {
    const cleaned = ns.map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!window.confirm("Change authoritative nameservers? Make sure the destination DNS zone already contains the required records.")) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/nameservers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameservers: cleaned }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not update nameservers."); await onChange();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update nameservers."); } finally { setSubmitting(false); }
  }

  return <section className="panel p-5"><div className="max-w-3xl"><h2 className="section-heading">Authoritative nameservers</h2><p className="mt-2 text-sm text-ink/55">Nameserver changes move DNS authority. Keep the previous zone available during migration and verify the target zone before saving.</p><div className="mt-5 space-y-3">{ns.map((value, index) => <div key={index} className="flex gap-2"><input className="input" placeholder={`Nameserver ${index + 1}`} value={value} onChange={(e) => setNs(ns.map((item, i) => i === index ? e.target.value : item))} />{ns.length > 2 ? <button type="button" onClick={() => setNs(ns.filter((_, i) => i !== index))} className="btn-secondary">Remove</button> : null}</div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={ns.length >= 13} onClick={() => setNs([...ns, ""])} className="btn-secondary">Add nameserver</button><button type="button" onClick={handleSave} disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Save nameservers"}</button></div>{error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}</div></section>;
}

function money(cents: number, currency: string) { return (cents / 100).toLocaleString(undefined, { style: "currency", currency }); }
