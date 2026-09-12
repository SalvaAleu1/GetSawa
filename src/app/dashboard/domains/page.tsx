"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface DomainRow {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  registeredAt: string | null;
  autoRenew: boolean;
  isLocked: boolean;
  privacyEnabled: boolean;
  lifecycle: string;
  daysUntilExpiry: number | null;
  tld: { extension: string };
  websiteProjects: Array<{ id: string; name: string; status: string }>;
}

interface PortfolioStats {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  autoRenewOff: number;
  unlocked: number;
}

const EMPTY_STATS: PortfolioStats = { total: 0, active: 0, expiringSoon: 0, expired: 0, autoRenewOff: 0, unlocked: 0 };

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [stats, setStats] = useState<PortfolioStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "ALL") params.set("status", status);
      params.set("sort", sort);
      const res = await fetch(`/api/dashboard/domains?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load your domains.");
      setDomains(data.domains || []);
      setStats(data.stats || EMPTY_STATS);
      setSelected((current) => current.filter((id) => (data.domains || []).some((d: DomainRow) => d.id === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your domains.");
    } finally {
      setLoading(false);
    }
  }, [q, status, sort]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const allSelected = domains.length > 0 && selected.length === domains.length;
  const selectedDomains = useMemo(() => domains.filter((domain) => selected.includes(domain.id)), [domains, selected]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function bulkAction(action: "LOCK" | "UNLOCK" | "AUTO_RENEW_ON" | "AUTO_RENEW_OFF") {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/domains/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainIds: selected, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed.");
      const failed = (data.results || []).filter((result: { success: boolean }) => !result.success);
      if (failed.length > 0) setError(`${failed.length} selected domain${failed.length === 1 ? "" : "s"} could not be updated at the registrar.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Domain control center</p>
          <h1 className="page-heading mt-2">My Domains</h1>
          <p className="page-subtitle">Monitor expiry risk, renewal protection, registrar lock state, privacy and connected websites from one portfolio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/domains/transfer" className="btn-secondary">Transfer a domain</Link>
          <Link href="/domains/search" className="btn-primary">Register a domain</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total" value={stats.total} />
        <Metric label="Active" value={stats.active} />
        <Metric label="Expiring ≤30d" value={stats.expiringSoon} tone={stats.expiringSoon > 0 ? "warning" : "normal"} />
        <Metric label="Expired" value={stats.expired} tone={stats.expired > 0 ? "danger" : "normal"} />
        <Metric label="Auto-renew off" value={stats.autoRenewOff} tone={stats.autoRenewOff > 0 ? "warning" : "normal"} />
        <Metric label="Unlocked" value={stats.unlocked} tone={stats.unlocked > 0 ? "warning" : "normal"} />
      </div>

      <section className="panel p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <div>
            <label className="label" htmlFor="domain-search">Search portfolio</label>
            <input id="domain-search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search example.com" />
          </div>
          <div>
            <label className="label" htmlFor="domain-status">Status</label>
            <select id="domain-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRING">Expiring</option>
              <option value="EXPIRED">Expired</option>
              <option value="TRANSFER_PENDING">Transfer pending</option>
              <option value="PENDING_REGISTRATION">Pending registration</option>
              <option value="REGISTRATION_FAILED">Registration failed</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="domain-sort">Sort</label>
            <select id="domain-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest added</option>
              <option value="name">Domain name</option>
              <option value="expiry_asc">Expiry soonest</option>
              <option value="expiry_desc">Expiry latest</option>
            </select>
          </div>
        </div>
      </section>

      {selected.length > 0 ? (
        <section className="panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{selected.length} selected</p>
            <p className="text-xs text-ink/50">Provider-backed bulk actions are applied individually so one registrar failure does not corrupt the rest of the selection.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || selectedDomains.every((d) => d.isLocked)} onClick={() => bulkAction("LOCK")} className="btn-secondary">Lock</button>
            <button disabled={busy || selectedDomains.every((d) => !d.isLocked)} onClick={() => bulkAction("UNLOCK")} className="btn-secondary">Unlock</button>
            <button disabled={busy || selectedDomains.every((d) => d.autoRenew)} onClick={() => bulkAction("AUTO_RENEW_ON")} className="btn-secondary">Enable auto-renew</button>
            <button disabled={busy || selectedDomains.every((d) => !d.autoRenew)} onClick={() => bulkAction("AUTO_RENEW_OFF")} className="btn-secondary">Disable auto-renew</button>
            <button disabled={busy} onClick={() => setSelected([])} className="btn-ghost">Clear</button>
          </div>
        </section>
      ) : null}

      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}

      {loading ? (
        <div className="table-shell p-6"><div className="skeleton h-64" /></div>
      ) : domains.length === 0 ? (
        <div className="empty-state">
          <p className="text-lg font-semibold">No domains match this view.</p>
          <p className="mt-2 max-w-md text-sm text-ink/55">Change the filters, transfer a domain you already own, or search for a new one.</p>
          <Link href="/domains/search" className="btn-primary mt-5">Search domains</Link>
        </div>
      ) : (
        <div className="table-shell overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b border-border bg-paper text-xs uppercase tracking-[0.08em] text-ink/40">
              <tr>
                <th className="w-12 px-4 py-3.5">
                  <input type="checkbox" aria-label="Select all domains" checked={allSelected} onChange={() => setSelected(allSelected ? [] : domains.map((d) => d.id))} />
                </th>
                <th className="px-4 py-3.5">Domain</th>
                <th className="px-4 py-3.5">Expiry health</th>
                <th className="px-4 py-3.5">Auto-renew</th>
                <th className="px-4 py-3.5">Security</th>
                <th className="px-4 py-3.5">Services</th>
                <th className="px-4 py-3.5"><span className="sr-only">Manage</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {domains.map((domain) => (
                <tr key={domain.id} className="hover:bg-paper/70">
                  <td className="px-4 py-4"><input type="checkbox" aria-label={`Select ${domain.name}`} checked={selected.includes(domain.id)} onChange={() => toggle(domain.id)} /></td>
                  <td className="px-4 py-4">
                    <Link href={`/dashboard/domains/${domain.id}`} className="font-semibold text-ink hover:text-brand-600">{domain.name}</Link>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={domain.status === "ACTIVE" ? "badge-success" : domain.status === "EXPIRED" || domain.status === "REGISTRATION_FAILED" ? "badge-danger" : "badge-warning"}>{domain.status.replace(/_/g, " ")}</span>
                      {domain.privacyEnabled ? <span className="badge-neutral">Privacy</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4"><Expiry domain={domain} /></td>
                  <td className="px-4 py-4">
                    <span className={domain.autoRenew ? "badge-success" : "badge-warning"}>{domain.autoRenew ? "On" : "Off"}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={domain.isLocked ? "badge-success" : "badge-warning"}>{domain.isLocked ? "Locked" : "Unlocked"}</span>
                  </td>
                  <td className="px-4 py-4 text-ink/55">{domain.websiteProjects.length > 0 ? `${domain.websiteProjects.length} website${domain.websiteProjects.length === 1 ? "" : "s"}` : "No website"}</td>
                  <td className="px-4 py-4 text-right"><Link href={`/dashboard/domains/${domain.id}`} className="btn-secondary">Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warning" | "danger" }) {
  return (
    <div className={`metric-card ${tone === "warning" ? "border-amber-300" : tone === "danger" ? "border-danger/30" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/40">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Expiry({ domain }: { domain: DomainRow }) {
  if (!domain.expiresAt) return <span className="text-ink/50">Pending registrar date</span>;
  const date = new Date(domain.expiresAt).toLocaleDateString();
  const days = domain.daysUntilExpiry;
  const className = domain.lifecycle === "expired" || domain.lifecycle === "critical" ? "text-danger" : domain.lifecycle === "warning" ? "text-amber-600" : "text-ink";
  return (
    <div>
      <p className={`font-semibold ${className}`}>{date}</p>
      <p className="mt-1 text-xs text-ink/45">{days == null ? "" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`}</p>
    </div>
  );
}
