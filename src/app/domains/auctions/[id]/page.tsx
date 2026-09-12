"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";

interface AuctionDetail {
  id: string; title: string; domainName: string; status: string; startAt: string; endAt: string; startingBidCents: number;
  minIncrementCents: number; reservePriceCents: number | null; paymentDeadline: string | null; renewalPriceCents: number; currency: string; source: string; outcome: string | null;
}
interface PaymentState { status: string; deadline: string | null; orderId: string | null; }
interface DetailResponse { auction: AuctionDetail; bids: Array<{ id: string; amountCents: number; createdAt: string; bidder: string }>; bidCount: number; currentBidCents: number; minimumNextBidCents: number; isHighestBidder: boolean; isWinner: boolean; canBid: boolean; payment: PaymentState | null; }

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/auctions/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Auction not found.");
      setData(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load auction."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(timer); }, [load]);

  async function placeBid(event: FormEvent) {
    event.preventDefault(); if (!data) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < data.minimumNextBidCents) { setError(`Your bid must be at least ${money(data.minimumNextBidCents, data.auction.currency)}.`); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/auctions/${id}/bid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents: cents }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not place bid.");
      setAmount(""); setNotice("Your bid was accepted."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not place bid."); }
    finally { setBusy(false); }
  }

  async function payWinner() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/auctions/${id}/pay/create-order`, { method: "POST" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not start winner payment.");
      if (payload.approveUrl) { window.location.href = payload.approveUrl; return; }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start winner payment."); setBusy(false); }
  }

  if (loading) return <><Navbar /><main className="bg-paper py-12"><div className="shell-container"><div className="skeleton h-96" /></div></main><SiteFooter /></>;
  if (!data) return <><Navbar /><main className="bg-paper py-12"><div className="shell-container"><div className="rounded-2xl border border-danger/20 bg-danger/5 p-5 text-danger">{error || "Auction not found."}</div></div></main><SiteFooter /></>;
  const { auction } = data;
  const paymentPending = data.isWinner && auction.status === "ENDED" && data.payment?.status === "PAYMENT_PENDING";

  return <><Navbar /><main className="bg-paper py-10 lg:py-14"><div className="shell-container">
    <Link href="/domains/auctions" className="text-sm font-semibold text-brand-600">← All auctions</Link>
    <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="card p-6 sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Verified auction</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">{auction.domainName}</h1><p className="mt-2 text-sm text-ink/50">{auction.title}</p></div><Status value={auction.status} /></div><div className="mt-7 grid gap-4 sm:grid-cols-3"><Stat label={data.bidCount > 0 ? "Current bid" : "Starting bid"} value={money(data.currentBidCents, auction.currency)} /><Stat label="Bids" value={String(data.bidCount)} /><Stat label="Renewal estimate" value={`${money(auction.renewalPriceCents, auction.currency)}/yr`} /></div><div className="mt-6 rounded-xl border border-border bg-paper p-4 text-sm leading-6 text-ink/60">{auction.status === "LIVE" ? `Bidding closes ${new Date(auction.endAt).toLocaleString()}. A bid inside the closing window automatically extends the end time.` : auction.status === "SCHEDULED" ? `Bidding opens ${new Date(auction.startAt).toLocaleString()}.` : auction.status === "ENDED" && data.isWinner ? "You are the winning bidder. Complete payment before the deadline shown here." : auction.status === "PAID" ? "Payment has been confirmed. Registrar ownership delivery is being verified." : auction.status === "COMPLETED" ? "This auction is complete and ownership delivery was verified." : "This auction has closed."}</div></section>

        {search.get("payment") === "cancelled" ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Payment was cancelled. You can retry while your winner payment window remains open.</div> : null}
        {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}
        {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}

        <section className="panel overflow-hidden"><div className="border-b border-border p-5"><h2 className="section-heading">Bid history</h2><p className="mt-1 text-sm text-ink/50">Bidder identities remain private.</p></div>{data.bids.length === 0 ? <p className="p-5 text-sm text-ink/50">No bids have been placed.</p> : <div className="divide-y divide-border">{data.bids.map((bid) => <div key={bid.id} className="flex items-center justify-between p-4 text-sm"><div><p className="font-semibold">{bid.bidder}</p><p className="text-xs text-ink/40">{new Date(bid.createdAt).toLocaleString()}</p></div><strong>{money(bid.amountCents, auction.currency)}</strong></div>)}</div>}</section>
      </div>

      <aside className="h-fit lg:sticky lg:top-24"><div className="card p-5">
        {auction.status === "LIVE" ? <><h2 className="text-lg font-bold">Place a bid</h2><p className="mt-2 text-sm text-ink/50">Minimum next bid {money(data.minimumNextBidCents, auction.currency)}.</p>{data.isHighestBidder ? <div className="mt-4 rounded-xl bg-success/5 p-3 text-sm font-semibold text-success">You currently have the highest bid.</div> : null}{data.canBid ? <form onSubmit={placeBid} className="mt-4 space-y-3"><div><label className="label">Bid amount (USD)</label><input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder={(data.minimumNextBidCents / 100).toFixed(2)} required /></div><button disabled={busy} className="btn-primary w-full">{busy ? "Submitting…" : "Place bid"}</button></form> : !data.isHighestBidder ? <p className="mt-4 text-sm text-ink/55">Sign in with an eligible, verified account to bid. Domain sellers cannot bid on their own auction.</p> : null}</> : null}
        {paymentPending ? <><h2 className="text-lg font-bold">Winner payment</h2><p className="mt-2 text-sm text-ink/55">Winning amount {money(data.currentBidCents, auction.currency)}.</p>{data.payment?.deadline ? <p className="mt-2 text-xs text-ink/45">Pay by {new Date(data.payment.deadline).toLocaleString()}.</p> : null}<button onClick={payWinner} disabled={busy} className="btn-primary mt-4 w-full">{busy ? "Preparing…" : "Pay winning bid"}</button></> : null}
        {data.isWinner && data.payment?.status === "FULFILLMENT_PENDING" ? <><h2 className="text-lg font-bold">Ownership delivery</h2><p className="mt-2 text-sm leading-6 text-ink/55">Your payment is confirmed. The domain remains protected while registrar ownership delivery is verified.</p></> : null}
        {auction.status === "COMPLETED" ? <><h2 className="text-lg font-bold">Auction complete</h2><p className="mt-2 text-sm text-ink/55">Registrar ownership delivery has been verified.</p></> : null}
      </div></aside>
    </div>
  </div></main><SiteFooter /></>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="metric-card"><p className="eyebrow">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>; }
function Status({ value }: { value: string }) { const cls = value === "LIVE" || value === "COMPLETED" ? "badge-success" : value === "CANCELLED" ? "badge-danger" : "badge-warning"; return <span className={cls}>{value.replace(/_/g," ")}</span>; }
function money(cents: number, currency = "USD") { return (Number(cents || 0) / 100).toLocaleString(undefined, { style: "currency", currency }); }
