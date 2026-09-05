"use client";

import { useEffect, useState } from "react";

type Ops = {
  generatedAt: string;
  database: string;
  alerts: Record<string, number>;
  indicators: Record<string, number>;
  recentAudit: Array<{ id: string; action: string; resource: string; resourceId: string | null; createdAt: string; actorId: string | null }>;
};

const labels: Record<string, string> = {
  failedProvisioning: "Failed provisioning",
  pendingPayments: "Pending payments",
  failedPayments24h: "Payment failures (24h)",
  disputedPayments: "Open disputes",
  expiringDomains7d: "Domains expiring (7d)",
  expiredDomains: "Expired domains",
  openTickets: "Open support tickets",
  pastDueRenewals: "Past-due renewals",
  renewalOrdersPending: "Renewal orders awaiting payment",
};

export default function OperationsPage() {
  const [data, setData] = useState<Ops | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operations", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Unable to load operations.");
      setData(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operations.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading && !data) return <p className="text-sm text-ink/60">Loading operations…</p>;
  if (error && !data) return <div className="card p-6"><p className="text-danger">{error}</p><button onClick={load} className="btn-secondary mt-4">Retry</button></div>;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Operations Center</h1><p className="mt-1 text-sm text-ink/60">Live operational signals for payments, domains, renewals, provisioning and support.</p></div>
      <button onClick={load} disabled={loading} className="btn-secondary">{loading ? "Refreshing…" : "Refresh"}</button>
    </div>

    <div className="mt-6 flex items-center gap-3 text-sm"><span className={data?.database === "operational" ? "badge-success" : "badge-danger"}>Database: {data?.database}</span><span className="text-ink/50">Updated {data ? new Date(data.generatedAt).toLocaleString() : "—"}</span></div>

    <section className="mt-6"><h2 className="font-semibold">Attention required</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data?.alerts || {}).map(([key, value]) => <div key={key} className={`card p-4 ${value > 0 ? "border-danger/30" : ""}`}><p className="text-sm text-ink/60">{labels[key] || key}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div></section>

    <section className="mt-8"><h2 className="font-semibold">Operational indicators</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="card p-4"><p className="text-sm text-ink/60">Domains expiring (30d)</p><p className="mt-1 text-2xl font-semibold">{data?.indicators.expiringDomains30d ?? 0}</p></div><div className="card p-4"><p className="text-sm text-ink/60">Suspended customers</p><p className="mt-1 text-2xl font-semibold">{data?.indicators.suspendedCustomers ?? 0}</p></div></div></section>

    <section className="mt-8"><h2 className="font-semibold">Recent audit activity</h2><div className="card mt-3 divide-y divide-border overflow-hidden">{data?.recentAudit.length ? data.recentAudit.map(a => <div key={a.id} className="px-5 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{a.action}</span><span className="text-ink/50">{new Date(a.createdAt).toLocaleString()}</span></div><p className="mt-0.5 text-xs text-ink/50">{a.resource}{a.resourceId ? ` · ${a.resourceId}` : ""}</p></div>) : <p className="px-5 py-6 text-sm text-ink/50">No audit activity recorded yet.</p>}</div></section>
  </div>;
}
