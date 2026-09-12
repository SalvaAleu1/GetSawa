"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

interface Inventory { id: string; domainName: string; purchasePriceCents: number; renewalPriceCents: number; currency: string; source: string; }
interface AuctionRow {
  id: string; title: string; domainName: string; status: string; startAt: string; endAt: string; startingBidCents: number;
  reservePriceCents: number | null; minIncrementCents: number; extensionSeconds: number; isFeatured: boolean; bidCount: number;
  currentBidCents: number | null; source: string | null; outcome: string | null; paymentStatus: string | null; winnerAmountCents: number | null;
  winnerPaymentDeadline: string | null; orderId: string | null;
}

export default function AdminAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ premiumDomainId: "", title: "", startingBid: "", reservePrice: "", minIncrement: "25", extensionSeconds: "120", startAt: "", endAt: "", isFeatured: false });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/auctions", { cache: "no-store" });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not load auctions.");
      setAuctions(data.auctions || []); setInventory(data.availableInventory || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load auctions."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createAuction(event: FormEvent) {
    event.preventDefault(); setBusy("create"); setError(null); setNotice(null);
    try {
      const startAt = new Date(form.startAt); const endAt = new Date(form.endAt);
      const response = await fetch("/api/admin/auctions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        premiumDomainId: form.premiumDomainId,
        title: form.title.trim(),
        startingBidCents: Math.round(Number(form.startingBid) * 100),
        reservePriceCents: form.reservePrice ? Math.round(Number(form.reservePrice) * 100) : undefined,
        minIncrementCents: Math.round(Number(form.minIncrement) * 100),
        extensionSeconds: Number(form.extensionSeconds),
        startAt: startAt.toISOString(), endAt: endAt.toISOString(), isFeatured: form.isFeatured,
      }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create auction.");
      setNotice(`${data.auction.domainName} auction created from verified inventory.`);
      setForm({ premiumDomainId: "", title: "", startingBid: "", reservePrice: "", minIncrement: "25", extensionSeconds: "120", startAt: "", endAt: "", isFeatured: false });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create auction."); }
    finally { setBusy(null); }
  }

  async function action(id: string, actionName: "close" | "feature" | "unfeature" | "cancel") {
    setBusy(id); setError(null); setNotice(null);
    try {
      const body = actionName === "cancel" ? { action: "cancel", reason: cancelReasons[id]?.trim() } : { action: actionName };
      const response = await fetch(`/api/admin/auctions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update auction.");
      setNotice(`Auction ${actionName} completed.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update auction."); }
    finally { setBusy(null); }
  }

  return <div className="page-stack">
    <div><p className="eyebrow">Domain commerce</p><h1 className="page-heading mt-2">Auction operations</h1><p className="page-subtitle">Only registrar-verified marketplace inventory can enter an auction. Winner payment and ownership delivery remain separate, auditable states.</p></div>
    {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

    <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-border p-5"><h2 className="section-heading">Auction lifecycle</h2></div>
        {loading ? <div className="p-5"><div className="skeleton h-56" /></div> : auctions.length === 0 ? <p className="p-6 text-sm text-ink/50">No auctions have been created.</p> : <div className="divide-y divide-border">{auctions.map((auction) => <article key={auction.id} className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="font-bold">{auction.domainName}</p><p className="mt-1 text-sm text-ink/55">{auction.bidCount || 0} bids · Current {money(auction.currentBidCents ?? auction.startingBidCents)} · Ends {new Date(auction.endAt).toLocaleString()}</p><div className="mt-2 flex flex-wrap gap-2"><Status value={auction.status} /><span className="badge-neutral">{(auction.source || "verified inventory").replace(/_/g, " ")}</span>{auction.paymentStatus ? <Status value={auction.paymentStatus} /> : null}{auction.outcome ? <span className="badge-neutral">{auction.outcome.replace(/_/g, " ")}</span> : null}</div>{auction.winnerPaymentDeadline && auction.paymentStatus === "PAYMENT_PENDING" ? <p className="mt-2 text-xs text-ink/50">Winner payment due {new Date(auction.winnerPaymentDeadline).toLocaleString()}</p> : null}{auction.paymentStatus === "FAILED" ? <p className="mt-2 text-sm font-semibold text-danger">Payment is held for finance review. Do not release inventory until payment/refund reconciliation is complete.</p> : null}</div><div className="flex min-w-64 flex-col gap-2"><div className="flex flex-wrap gap-2"><button disabled={busy === auction.id} onClick={() => action(auction.id, auction.isFeatured ? "unfeature" : "feature")} className="btn-secondary">{auction.isFeatured ? "Unfeature" : "Feature"}</button>{["LIVE","SCHEDULED"].includes(auction.status) ? <button disabled={busy === auction.id} onClick={() => action(auction.id, "close")} className="btn-secondary">Close now</button> : null}</div>{["LIVE","SCHEDULED","DRAFT"].includes(auction.status) && !auction.paymentStatus ? <><input className="input" placeholder="Cancellation reason" value={cancelReasons[auction.id] || ""} onChange={(event) => setCancelReasons({ ...cancelReasons, [auction.id]: event.target.value })} /><button disabled={busy === auction.id || (cancelReasons[auction.id]?.trim().length || 0) < 5} onClick={() => action(auction.id, "cancel")} className="btn-danger">Cancel and release inventory</button></> : null}</div></div></article>)}</div>}
      </section>

      <form onSubmit={createAuction} className="panel h-fit p-5">
        <h2 className="section-heading">Create verified auction</h2><p className="mt-2 text-sm leading-6 text-ink/50">Starting/reserve economics are validated server-side against acquisition cost or seller commission before the auction is created.</p>
        <div className="mt-5 space-y-4">
          <div><label className="label">Verified domain inventory</label><select className="input" required value={form.premiumDomainId} onChange={(event) => { const selected = inventory.find((item) => item.id === event.target.value); setForm({ ...form, premiumDomainId: event.target.value, title: selected?.domainName || form.title }); }}><option value="">Select inventory</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.domainName} · {item.source.replace(/_/g," ")}</option>)}</select></div>
          <Field label="Auction title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Starting bid USD" value={form.startingBid} onChange={(value) => setForm({ ...form, startingBid: value })} /><Field label="Reserve USD" value={form.reservePrice} onChange={(value) => setForm({ ...form, reservePrice: value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Minimum increment USD" value={form.minIncrement} onChange={(value) => setForm({ ...form, minIncrement: value })} /><Field label="Anti-sniping seconds" value={form.extensionSeconds} onChange={(value) => setForm({ ...form, extensionSeconds: value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Starts</label><input type="datetime-local" className="input" required value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></div><div><label className="label">Ends</label><input type="datetime-local" className="input" required value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></div></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })} /> Feature this auction</label>
          <button disabled={busy === "create" || inventory.length === 0} className="btn-primary w-full">{busy === "create" ? "Validating…" : "Create auction"}</button>
        </div>
      </form>
    </div>
  </div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div><label className="label">{label}</label><input className="input" required={label !== "Reserve USD"} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function Status({ value }: { value: string }) { const cls = ["LIVE","PAID","COMPLETED"].includes(value) ? "badge-success" : ["FAILED","CANCELLED","PAYMENT_EXPIRED"].includes(value) ? "badge-danger" : ["SCHEDULED","ENDED","PAYMENT_PENDING","FULFILLMENT_PENDING"].includes(value) ? "badge-warning" : "badge-neutral"; return <span className={cls}>{value.replace(/_/g," ")}</span>; }
function money(cents: number, currency = "USD") { return (Number(cents || 0) / 100).toLocaleString(undefined, { style: "currency", currency }); }
