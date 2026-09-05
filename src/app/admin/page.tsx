"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/money";

interface Overview {
  totalCustomers: number; activeCustomers: number; totalDomains: number; domainsThisPeriod: number; expiringSoon: number; expiredDomains: number;
  revenueCentsThisPeriod: number; pendingPayments: number; failedPayments: number; refunds: number; openTickets: number; activePromotions: number;
  provisioningPending: number; provisioningFailed: number;
  recentOrders: { id: string; orderNumber: string; status: string; totalCents: number; currency: string; user: { email: string } }[];
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/admin/overview?days=30", { cache: "no-store" }).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "Unable to load overview"); return body; }).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Unable to load overview")); }, []);
  if (error) return <p className="text-danger">{error}</p>;
  if (!data) return <p className="text-ink/60">Loading…</p>;

  const cards = [
    ["Total Customers", data.totalCustomers], ["Revenue (30d)", formatCents(data.revenueCentsThisPeriod)], ["Active Domains", data.totalDomains], ["Expiring in 30d", data.expiringSoon],
    ["Pending Payments", data.pendingPayments], ["Failed Payments (30d)", data.failedPayments], ["Provisioning Pending", data.provisioningPending], ["Provisioning Failed", data.provisioningFailed],
    ["Expired Domains", data.expiredDomains], ["Open Support Tickets", data.openTickets], ["Active Promotions", data.activePromotions], ["Refunds (30d)", data.refunds],
  ];

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Operations Overview</h1><p className="mt-1 text-sm text-ink/60">Live commerce, fulfilment and service-health metrics.</p></div><Link href="/admin/orders" className="btn-secondary">Open order operations</Link></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={String(label)} className="card p-5"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-ink/60">{label}</p></div>)}</div>
    {(data.provisioningFailed > 0 || data.provisioningPending > 0) && <div className="card mt-6 border-amber-300 bg-amber-50 p-5"><p className="font-semibold">Fulfilment requires attention</p><p className="mt-1 text-sm text-ink/70">{data.provisioningFailed} failed and {data.provisioningPending} pending provisioning items are attached to paid/provisioning orders.</p><Link href="/admin/orders?status=PROVISIONING" className="mt-3 inline-flex text-sm font-medium text-brand-600">Review provisioning →</Link></div>}
    <div className="mt-10"><h2 className="text-lg font-semibold">Recent orders</h2><div className="card mt-3 divide-y divide-border">{data.recentOrders.map((o) => <Link key={o.id} href="/admin/orders" className="flex items-center justify-between px-5 py-3.5 hover:bg-paper"><div><p className="font-medium">{o.orderNumber}</p><p className="text-xs text-ink/50">{o.user.email}</p></div><div className="flex items-center gap-3"><span className="font-semibold">{formatCents(o.totalCents, o.currency)}</span><span className="badge-neutral">{o.status.replace(/_/g, " ")}</span></div></Link>)}{data.recentOrders.length === 0 && <p className="p-5 text-sm text-ink/60">No orders yet.</p>}</div></div>
  </div>;
}
