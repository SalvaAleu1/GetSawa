"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ServiceData = {
  summary: { domains: { total: number; active: number; expired: number; expiringSoon: number }; websites: number; fulfilmentItems: number };
  domains: { id: string; name: string; status: string; expiresAt: string | null; autoRenew: boolean; providerName: string; }[];
  websites: { id: string; name: string; slug: string; status: string; domainId: string | null }[];
  fulfilment: { id: string; name: string; category: string; provisioningStatus: string; note: string | null; orderNumber: string; orderId: string }[];
};

function statusClass(status: string) {
  if (["ACTIVE", "PROVISIONED", "PUBLISHED"].includes(status)) return "badge-success";
  if (["FAILED", "EXPIRED"].includes(status)) return "badge-danger";
  return "badge-warning";
}

export default function ServicesPage() {
  const [data, setData] = useState<ServiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/services", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Unable to load services.");
        return body as ServiceData;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load services."));
  }, []);

  if (error) return <div><h1 className="text-2xl font-semibold">My Services</h1><p className="mt-4 text-danger">{error}</p></div>;
  if (!data) return <p className="text-ink/60">Loading services…</p>;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">My Services</h1><p className="mt-1 text-sm text-ink/60">A single view of your domains, websites and purchased services.</p></div>
        <div className="flex gap-2"><Link href="/domains/search" className="btn-primary">Register domain</Link><Link href="/dashboard/websites" className="btn-secondary">Build website</Link></div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Total domains" value={data.summary.domains.total} /><Metric label="Active domains" value={data.summary.domains.active} /><Metric label="Expiring in 30 days" value={data.summary.domains.expiringSoon} /><Metric label="Websites" value={data.summary.websites} /></div>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Domain portfolio</h2><Link href="/dashboard/domains" className="text-sm text-brand-600">Manage domains →</Link></div><div className="card mt-3 divide-y divide-border">{data.domains.length === 0 ? <p className="p-5 text-sm text-ink/60">No domains yet.</p> : data.domains.map((domain) => <Link key={domain.id} href={`/dashboard/domains/${domain.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-paper"><div><p className="font-medium">{domain.name}</p><p className="text-xs text-ink/50">{domain.expiresAt ? `Expires ${new Date(domain.expiresAt).toDateString()}` : "Expiry date unavailable"}</p></div><div className="flex items-center gap-2">{domain.autoRenew && <span className="badge-neutral">Auto-renew</span>}<span className={statusClass(domain.status)}>{domain.status.replace(/_/g, " ")}</span></div></Link>)}</div></section>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Websites</h2><Link href="/dashboard/websites" className="text-sm text-brand-600">Manage websites →</Link></div><div className="card mt-3 divide-y divide-border">{data.websites.length === 0 ? <p className="p-5 text-sm text-ink/60">No websites yet.</p> : data.websites.map((site) => <Link key={site.id} href={`/dashboard/websites/${site.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-paper"><div><p className="font-medium">{site.name}</p><p className="text-xs text-ink/50">/sites/{site.slug}</p></div><span className={statusClass(site.status)}>{site.status}</span></Link>)}</div></section>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent fulfilment</h2><Link href="/dashboard/orders" className="text-sm text-brand-600">View orders →</Link></div><div className="card mt-3 divide-y divide-border">{data.fulfilment.length === 0 ? <p className="p-5 text-sm text-ink/60">No purchased services to display.</p> : data.fulfilment.slice(0, 10).map((item) => <Link key={item.id} href={`/dashboard/orders/${item.orderId}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-paper"><div><p className="font-medium">{item.name}</p><p className="text-xs text-ink/50">{item.orderNumber} · {item.category.replace(/_/g, " ")}</p>{item.note && item.provisioningStatus === "FAILED" && <p className="mt-1 text-xs text-danger">{item.note}</p>}</div><span className={statusClass(item.provisioningStatus)}>{item.provisioningStatus.replace(/_/g, " ")}</span></Link>)}</div></section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="card p-5"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-ink/60">{label}</p></div>; }
