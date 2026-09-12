"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

interface Metrics { listed: number; reserved: number; sold: number; unverified: number; activeOffers: number; fulfillmentQueue: number; platformRevenueCents: number; sellerPayableCents: number; }
interface Inventory { id: string; domainName: string; retailPriceCents: number; renewalPriceCents: number; currency: string; category: string | null; isFeatured: boolean; status: string; source: string | null; acquisitionCostCents: number | null; commissionBps: number | null; ownershipVerifiedAt: string | null; reservedUntil: string | null; sellerEmail: string | null; }
interface RequestRow { id: string; domainName: string; sellerEmail: string; sellerFirstName: string; sellerLastName: string; asking_price_cents: number; currency: string; status: string; category: string | null; created_at: string; }
interface OfferRow { id: string; domainName: string; buyerEmail: string; amount_cents: number; askingPriceCents: number; currency: string; status: string; counter_amount_cents: number | null; accepted_price_cents: number | null; expires_at: string | null; }
interface FulfillmentRow { orderItemId: string; orderNumber: string; domainName: string; buyerEmail: string; sellerEmail: string | null; totalCents: number; currency: string; source: string; }
interface SaleRow { id: string; domainName: string; orderNumber: string; buyerEmail: string; sellerEmail: string | null; gross_cents: number; seller_proceeds_cents: number; platform_revenue_cents: number; currency: string; settlement_status: string; settlement_reference: string | null; fulfilled_at: string | null; }

type Section = "inventory" | "requests" | "offers" | "fulfillment" | "settlements";

export default function AdminPremiumDomainsPage() {
  const [section, setSection] = useState<Section>("inventory");
  const [metrics, setMetrics] = useState<Metrics>({ listed: 0, reserved: 0, sold: 0, unverified: 0, activeOffers: 0, fulfillmentQueue: 0, platformRevenueCents: 0, sellerPayableCents: 0 });
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [fulfillment, setFulfillment] = useState<FulfillmentRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterValues, setCounterValues] = useState<Record<string, string>>({});
  const [commissionValues, setCommissionValues] = useState<Record<string, string>>({});
  const [registrarRefs, setRegistrarRefs] = useState<Record<string, string>>({});
  const [settlementRefs, setSettlementRefs] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ domainName: "", acquisitionCost: "", retailPrice: "", category: "", featured: false });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [inventoryRes, requestRes, offerRes, fulfillmentRes, salesRes] = await Promise.all([
        fetch("/api/admin/premium-domains", { cache: "no-store" }),
        fetch("/api/admin/premium-domains/requests", { cache: "no-store" }),
        fetch("/api/admin/premium-domains/offers", { cache: "no-store" }),
        fetch("/api/admin/premium-domains/fulfillment", { cache: "no-store" }),
        fetch("/api/admin/premium-domains/sales", { cache: "no-store" }),
      ]);
      const payloads = await Promise.all([inventoryRes.json(), requestRes.json(), offerRes.json(), fulfillmentRes.json(), salesRes.json()]);
      const failed = [inventoryRes, requestRes, offerRes, fulfillmentRes, salesRes].findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(payloads[failed]?.error || "Could not load premium marketplace operations.");
      setInventory(payloads[0].listings || []); setMetrics(payloads[0].metrics || metrics);
      setRequests(payloads[1].requests || []); setOffers(payloads[2].offers || []); setFulfillment(payloads[3].queue || []); setSales(payloads[4].sales || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load premium marketplace operations."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function apiAction(key: string, url: string, body: unknown, success: string) {
    setBusy(key); setError(null); setNotice(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Operation failed.");
      setNotice(success); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Operation failed."); }
    finally { setBusy(null); }
  }

  async function createInventory(event: FormEvent) {
    event.preventDefault();
    const acquisition = Number(form.acquisitionCost); const retail = Number(form.retailPrice);
    if (!form.domainName.trim() || !Number.isFinite(acquisition) || acquisition < 0 || !Number.isFinite(retail) || retail <= 0) { setError("Enter the managed domain, acquisition cost and retail price."); return; }
    setBusy("create"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/premium-domains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domainName: form.domainName.trim(), acquisitionCostCents: Math.round(acquisition * 100), retailPriceCents: Math.round(retail * 100), category: form.category.trim() || undefined, isFeatured: form.featured, autoBuyEnabled: true }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not verify and list this inventory.");
      setForm({ domainName: "", acquisitionCost: "", retailPrice: "", category: "", featured: false }); setNotice("Inventory custody was verified and the listing was saved."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create inventory."); }
    finally { setBusy(null); }
  }

  return <div className="page-stack">
    <div><p className="eyebrow">Domain commerce</p><h1 className="page-heading mt-2">Premium marketplace operations</h1><p className="page-subtitle">Custody, offers, paid ownership delivery and seller settlements are controlled from verified backend state.</p></div>
    {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Listed" value={metrics.listed} /><Metric label="Reserved" value={metrics.reserved} /><Metric label="Fulfillment queue" value={metrics.fulfillmentQueue} /><Metric label="Seller payable" value={money(metrics.sellerPayableCents)} /></div>

    <div className="overflow-x-auto border-b border-border"><div className="flex min-w-max gap-1">{(["inventory","requests","offers","fulfillment","settlements"] as Section[]).map((item) => <button key={item} onClick={() => setSection(item)} className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${section === item ? "border-brand-500 text-brand-600" : "border-transparent text-ink/50"}`}>{item}</button>)}</div></div>

    {loading ? <div className="skeleton h-80" /> : null}

    {!loading && section === "inventory" ? <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
      <section className="panel overflow-hidden"><div className="border-b border-border p-5"><h2 className="section-heading">Verified inventory</h2></div><div className="divide-y divide-border">{inventory.length === 0 ? <p className="p-5 text-sm text-ink/50">No verified premium inventory.</p> : inventory.map((item) => <div key={item.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{item.domainName}</p><p className="mt-1 text-sm text-ink/55">{money(item.retailPriceCents, item.currency)} · renews {money(item.renewalPriceCents, item.currency)}</p><div className="mt-2 flex flex-wrap gap-2"><Status value={item.status} /><span className="badge-neutral">{(item.source || "UNVERIFIED").replace(/_/g," ")}</span>{item.ownershipVerifiedAt ? <span className="badge-success">Custody verified</span> : <span className="badge-danger">Unverified</span>}</div></div><div className="text-sm sm:text-right"><p className="text-ink/50">Acquisition {item.acquisitionCostCents == null ? "—" : money(item.acquisitionCostCents, item.currency)}</p>{item.commissionBps ? <p className="text-ink/50">Commission {(item.commissionBps / 100).toFixed(2)}%</p> : null}</div></div></div>)}</div></section>
      <form onSubmit={createInventory} className="panel h-fit p-5"><h2 className="section-heading">Add GetSawa inventory</h2><p className="mt-2 text-sm text-ink/50">Only a domain already managed by an administrative GetSawa account can pass custody verification.</p><div className="mt-5 space-y-4"><Input label="Managed domain" value={form.domainName} onChange={(value) => setForm({ ...form, domainName: value })} /><Input label="Acquisition cost (USD)" value={form.acquisitionCost} onChange={(value) => setForm({ ...form, acquisitionCost: value })} /><Input label="Retail price (USD)" value={form.retailPrice} onChange={(value) => setForm({ ...form, retailPrice: value })} /><Input label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} /> Featured listing</label><button disabled={busy === "create"} className="btn-primary w-full">{busy === "create" ? "Verifying…" : "Verify and add inventory"}</button></div></form>
    </div> : null}

    {!loading && section === "requests" ? <section className="panel divide-y divide-border">{requests.length === 0 ? <p className="p-5 text-sm text-ink/50">No seller requests awaiting review.</p> : requests.map((item) => <div key={item.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold">{item.domainName}</p><p className="mt-1 text-sm text-ink/55">{item.sellerFirstName} {item.sellerLastName} · {item.sellerEmail}</p><p className="mt-1 text-sm">Asking {money(item.asking_price_cents, item.currency)}</p><div className="mt-2"><Status value={item.status} /></div></div>{item.status === "SUBMITTED" ? <div className="flex flex-col gap-2 sm:min-w-64"><input className="input" inputMode="decimal" placeholder="Commission %" value={commissionValues[item.id] || ""} onChange={(event) => setCommissionValues({ ...commissionValues, [item.id]: event.target.value })} /><div className="flex gap-2"><button disabled={busy === item.id} onClick={() => apiAction(item.id, `/api/admin/premium-domains/requests/${item.id}`, { action: "APPROVE", commissionBps: Math.round(Number(commissionValues[item.id]) * 100) }, "Seller listing approved after custody and margin validation.")} className="btn-primary">Approve</button><button disabled={busy === item.id} onClick={() => apiAction(item.id, `/api/admin/premium-domains/requests/${item.id}`, { action: "REJECT", note: "Marketplace listing was not approved." }, "Listing request rejected.")} className="btn-secondary">Reject</button></div></div> : null}</div></div>)}</section> : null}

    {!loading && section === "offers" ? <section className="panel divide-y divide-border">{offers.length === 0 ? <p className="p-5 text-sm text-ink/50">No marketplace offers.</p> : offers.map((item) => <div key={item.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold">{item.domainName}</p><p className="mt-1 text-sm text-ink/55">Buyer {item.buyerEmail}</p><p className="mt-1 text-sm">Offer {money(item.amount_cents, item.currency)} · Asking {money(item.askingPriceCents, item.currency)}</p><div className="mt-2"><Status value={item.status} /></div></div>{item.status === "PENDING" ? <div className="flex flex-col gap-2 sm:min-w-64"><input className="input" inputMode="decimal" placeholder="Counter price USD" value={counterValues[item.id] || ""} onChange={(event) => setCounterValues({ ...counterValues, [item.id]: event.target.value })} /><div className="flex flex-wrap gap-2"><button disabled={busy === item.id} onClick={() => apiAction(item.id, `/api/admin/premium-domains/offers/${item.id}`, { action: "ACCEPT" }, "Offer accepted and inventory reserved for the buyer.")} className="btn-primary">Accept</button><button disabled={busy === item.id || !counterValues[item.id]} onClick={() => apiAction(item.id, `/api/admin/premium-domains/offers/${item.id}`, { action: "COUNTER", counterAmountCents: Math.round(Number(counterValues[item.id]) * 100) }, "Counter-offer issued after margin validation.")} className="btn-secondary">Counter</button><button disabled={busy === item.id} onClick={() => apiAction(item.id, `/api/admin/premium-domains/offers/${item.id}`, { action: "REJECT" }, "Offer rejected.")} className="btn-secondary">Reject</button></div></div> : null}</div></div>)}</section> : null}

    {!loading && section === "fulfillment" ? <section className="panel divide-y divide-border">{fulfillment.length === 0 ? <p className="p-5 text-sm text-ink/50">No paid premium domains are awaiting registrar ownership verification.</p> : fulfillment.map((item) => <div key={item.orderItemId} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold">{item.domainName}</p><p className="mt-1 text-sm text-ink/55">{item.orderNumber} · Buyer {item.buyerEmail}</p><p className="mt-1 text-sm">Paid {money(item.totalCents, item.currency)} · {item.source.replace(/_/g," ")}</p></div><div className="flex flex-col gap-2 sm:min-w-80"><input className="input" placeholder="Registrar ownership-change reference" value={registrarRefs[item.orderItemId] || ""} onChange={(event) => setRegistrarRefs({ ...registrarRefs, [item.orderItemId]: event.target.value })} /><button disabled={busy === item.orderItemId || !registrarRefs[item.orderItemId]?.trim()} onClick={() => apiAction(item.orderItemId, `/api/admin/premium-domains/fulfillment/${item.orderItemId}`, { registrarVerified: true, registrarReference: registrarRefs[item.orderItemId] }, "Ownership delivery verified and buyer portfolio updated.")} className="btn-primary">Confirm registrar delivery</button></div></div></div>)}</section> : null}

    {!loading && section === "settlements" ? <section className="panel divide-y divide-border">{sales.length === 0 ? <p className="p-5 text-sm text-ink/50">No premium-domain sales recorded.</p> : sales.map((item) => <div key={item.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold">{item.domainName}</p><p className="mt-1 text-sm text-ink/55">{item.orderNumber} · Buyer {item.buyerEmail}{item.sellerEmail ? ` · Seller ${item.sellerEmail}` : ""}</p><p className="mt-1 text-sm">Gross {money(item.gross_cents, item.currency)} · Platform {money(item.platform_revenue_cents, item.currency)} · Seller {money(item.seller_proceeds_cents, item.currency)}</p><div className="mt-2"><Status value={item.settlement_status} /></div></div>{item.sellerEmail && item.seller_proceeds_cents > 0 && item.settlement_status !== "PAID" ? <div className="flex flex-col gap-2 sm:min-w-80"><input className="input" placeholder="Payout transaction/reference" value={settlementRefs[item.id] || ""} onChange={(event) => setSettlementRefs({ ...settlementRefs, [item.id]: event.target.value })} /><div className="flex gap-2"><button disabled={busy === item.id} onClick={() => apiAction(item.id, `/api/admin/premium-domains/sales/${item.id}/settlement`, { status: "HELD" }, "Seller proceeds placed on hold.")} className="btn-secondary">Hold</button><button disabled={busy === item.id || !settlementRefs[item.id]?.trim()} onClick={() => apiAction(item.id, `/api/admin/premium-domains/sales/${item.id}/settlement`, { status: "PAID", reference: settlementRefs[item.id] }, "Seller proceeds marked paid with settlement reference.")} className="btn-primary">Mark paid</button></div></div> : null}</div></div>)}</section> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="metric-card"><p className="eyebrow">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>; }
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div><label className="label">{label}</label><input className="input" value={value} onChange={(event) => onChange(event.target.value)} required /></div>; }
function Status({ value }: { value: string }) { const cls = ["LISTED","APPROVED","ACCEPTED","PAID","SOLD"].includes(value) ? "badge-success" : ["REJECTED","FAILED","EXPIRED"].includes(value) ? "badge-danger" : ["PENDING","SUBMITTED","COUNTERED","RESERVED","HELD"].includes(value) ? "badge-warning" : "badge-neutral"; return <span className={cls}>{value.replace(/_/g," ")}</span>; }
function money(cents: number, currency = "USD") { return (Number(cents || 0) / 100).toLocaleString(undefined, { style: "currency", currency }); }
