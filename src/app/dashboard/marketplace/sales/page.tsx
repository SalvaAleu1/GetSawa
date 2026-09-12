"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Sale {
  id: string;
  domainName: string;
  grossCents: number;
  sellerProceedsCents: number;
  platformRevenueCents: number;
  currency: string;
  settlementStatus: string;
  settlementReference: string | null;
  settledAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  orderNumber: string;
  buyerEmail: string;
}
interface Summary { lifetimeProceedsCents: number; outstandingCents: number; paidCents: number; saleCount: number; }

export default function MarketplaceSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<Summary>({ lifetimeProceedsCents: 0, outstandingCents: 0, paidCents: 0, saleCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/marketplace/sales", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load marketplace sales.");
        setSales(data.sales || []);
        setSummary(data.summary || summary);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load marketplace sales."))
      .finally(() => setLoading(false));
  }, []);

  return <div className="page-stack">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="eyebrow">Marketplace sales</p><h1 className="page-heading mt-2">Seller proceeds</h1><p className="page-subtitle">Track completed premium-domain sales and seller payout status.</p></div>
      <Link href="/dashboard/marketplace" className="btn-secondary">Back to marketplace</Link>
    </div>

    {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Sales" value={String(summary.saleCount)} />
      <Metric label="Lifetime proceeds" value={money(summary.lifetimeProceedsCents)} />
      <Metric label="Awaiting settlement" value={money(summary.outstandingCents)} />
      <Metric label="Paid" value={money(summary.paidCents)} />
    </div>

    <section className="panel overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="section-heading">Sale history</h2><p className="mt-1 text-sm text-ink/50">Seller proceeds become payable only after registrar fulfillment has been verified.</p></div>
      {loading ? <div className="p-5"><div className="skeleton h-48" /></div> : sales.length === 0 ? <div className="p-6 text-sm text-ink/50">No marketplace sales have completed yet.</div> : <div className="divide-y divide-border">{sales.map((sale) => <article key={sale.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold">{sale.domainName}</p><p className="mt-1 text-xs text-ink/45">{sale.orderNumber} · Buyer {sale.buyerEmail}</p><div className="mt-3 flex flex-wrap gap-2"><span className={sale.fulfilledAt ? "badge-success" : "badge-warning"}>{sale.fulfilledAt ? "Ownership delivered" : "Fulfillment in progress"}</span><span className={sale.settlementStatus === "PAID" ? "badge-success" : sale.settlementStatus === "HELD" ? "badge-warning" : "badge-neutral"}>Payout {sale.settlementStatus.toLowerCase()}</span></div></div><div className="grid min-w-64 gap-1 text-sm sm:text-right"><p><span className="text-ink/50">Sale price </span><strong>{money(sale.grossCents, sale.currency)}</strong></p><p><span className="text-ink/50">Your proceeds </span><strong>{money(sale.sellerProceedsCents, sale.currency)}</strong></p>{sale.settlementReference ? <p className="text-xs text-ink/45">Reference {sale.settlementReference}</p> : null}{sale.settledAt ? <p className="text-xs text-ink/45">Settled {new Date(sale.settledAt).toLocaleString()}</p> : null}</div></div></article>)}</div>}
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric-card"><p className="eyebrow">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>; }
function money(cents: number, currency = "USD") { return (Number(cents || 0) / 100).toLocaleString(undefined, { style: "currency", currency }); }
