"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface DomainOption { id: string; name: string; status: string; expiresAt: string | null; }
interface ListingRequest { id: string; domainName: string; asking_price_cents: number; currency: string; category: string | null; status: string; commission_bps: number | null; listingStatus: string | null; created_at: string; decision_note: string | null; }
interface Offer { id: string; premium_domain_id: string; domainName: string; amount_cents: number; askingPriceCents: number; currency: string; status: string; counter_amount_cents: number | null; accepted_price_cents: number | null; expires_at: string | null; created_at: string; }

export default function MarketplaceDashboardPage() {
  const params = useSearchParams();
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [requests, setRequests] = useState<ListingRequest[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [domainId, setDomainId] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [category, setCategory] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [domainRes, requestRes, offerRes] = await Promise.all([
        fetch("/api/dashboard/domains?status=ACTIVE", { cache: "no-store" }),
        fetch("/api/dashboard/marketplace/listings", { cache: "no-store" }),
        fetch("/api/dashboard/premium-offers", { cache: "no-store" }),
      ]);
      const [domainData, requestData, offerData] = await Promise.all([domainRes.json(), requestRes.json(), offerRes.json()]);
      if (!domainRes.ok) throw new Error(domainData.error || "Could not load your domains.");
      if (!requestRes.ok) throw new Error(requestData.error || "Could not load your marketplace listings.");
      if (!offerRes.ok) throw new Error(offerData.error || "Could not load your offers.");
      setDomains((domainData.domains || []).filter((item: DomainOption) => ["ACTIVE", "EXPIRING"].includes(item.status)));
      setRequests(requestData.requests || []);
      setOffers(offerData.offers || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load marketplace activity."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeRequestDomainIds = useMemo(() => new Set(requests.filter((item) => ["SUBMITTED", "APPROVED"].includes(item.status)).map((item) => {
    const domain = domains.find((candidate) => candidate.name === item.domainName);
    return domain?.id;
  }).filter(Boolean)), [requests, domains]);
  const availableToList = domains.filter((item) => !activeRequestDomainIds.has(item.id));

  async function submitListing(event: FormEvent) {
    event.preventDefault(); setError(null); setSuccess(null);
    const dollars = Number(askingPrice);
    if (!domainId || !Number.isFinite(dollars) || dollars <= 0 || !termsAccepted) { setError("Choose a domain, enter an asking price, and accept the marketplace terms."); return; }
    setBusy("new-listing");
    try {
      const res = await fetch("/api/dashboard/marketplace/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domainId, askingPriceCents: Math.round(dollars * 100), category: category.trim() || undefined, termsAccepted: true }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not submit this domain.");
      setSuccess(`${data.request.domainName} was submitted for marketplace review.`); setDomainId(""); setAskingPrice(""); setCategory(""); setTermsAccepted(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this domain."); }
    finally { setBusy(null); }
  }

  async function withdrawRequest(id: string) {
    setBusy(id); setError(null); setSuccess(null);
    try { const res = await fetch(`/api/dashboard/marketplace/listings/${id}`, { method: "DELETE" }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not withdraw the request."); setSuccess("Listing request withdrawn."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not withdraw the request."); }
    finally { setBusy(null); }
  }

  async function offerAction(id: string, action: "ACCEPT_COUNTER" | "WITHDRAW") {
    setBusy(id); setError(null); setSuccess(null);
    try { const res = await fetch(`/api/dashboard/premium-offers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not update the offer."); setSuccess(action === "ACCEPT_COUNTER" ? "Counter-offer accepted. The domain is reserved for your purchase window." : "Offer withdrawn."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the offer."); }
    finally { setBusy(null); }
  }

  async function checkoutOffer(id: string) {
    setBusy(id); setError(null);
    try { const res = await fetch(`/api/dashboard/premium-offers/${id}/checkout`, { method: "POST" }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not start checkout."); if (!data.approveUrl) throw new Error("Payment approval is unavailable."); window.location.href = data.approveUrl; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start checkout."); setBusy(null); }
  }

  return <div className="page-stack">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Marketplace</p><h1 className="page-heading mt-2">Premium domain marketplace</h1><p className="page-subtitle">Sell eligible domains you own and manage offers you have made on premium listings.</p></div><Link href="/domains/premium" className="btn-primary">Browse premium domains</Link></div>
    {params.get("payment") === "cancelled" ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Payment was cancelled. Any accepted offer remains subject to its purchase deadline.</div> : null}
    {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {success ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{success}</div> : null}

    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <section className="panel p-5">
        <h2 className="section-heading">List one of your domains</h2><p className="mt-2 text-sm leading-6 text-ink/55">Submit an active domain from your portfolio for review. It is not published until ownership and registrar custody are verified.</p>
        <form onSubmit={submitListing} className="mt-5 space-y-4">
          <div><label className="label" htmlFor="seller-domain">Domain</label><select id="seller-domain" className="input" value={domainId} onChange={(event) => setDomainId(event.target.value)} required><option value="">Select a domain</option>{availableToList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{availableToList.length === 0 ? <p className="mt-2 text-xs text-ink/45">All eligible domains are already submitted or listed.</p> : null}</div>
          <div><label className="label" htmlFor="asking-price">Asking price (USD)</label><input id="asking-price" className="input" inputMode="decimal" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="2500" required /></div>
          <div><label className="label" htmlFor="listing-category">Category</label><input id="listing-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Technology, travel, finance…" maxLength={100} /></div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1" /><span>I confirm that I own this domain in my GetSawa account and authorize GetSawa to market it at the submitted asking price if the listing is approved. Marketplace commission and seller proceeds will be shown before approval.</span></label>
          <button disabled={busy === "new-listing" || availableToList.length === 0} className="btn-primary w-full">{busy === "new-listing" ? "Submitting…" : "Submit for review"}</button>
        </form>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border p-5"><h2 className="section-heading">Your listing requests</h2><p className="mt-1 text-sm text-ink/50">Track review, publication and sale status.</p></div>
        {loading ? <div className="p-5"><div className="skeleton h-40" /></div> : requests.length === 0 ? <div className="p-6 text-sm text-ink/50">You have not submitted a domain for sale.</div> : <div className="divide-y divide-border">{requests.map((item) => <div key={item.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{item.domainName}</p><p className="mt-1 text-sm text-ink/55">Asking {money(item.asking_price_cents, item.currency)}</p><div className="mt-2 flex flex-wrap gap-2"><Status status={item.status} />{item.commission_bps != null ? <span className="badge-neutral">Commission {(item.commission_bps / 100).toFixed(2)}%</span> : null}{item.listingStatus ? <span className="badge-neutral">Listing {item.listingStatus.toLowerCase()}</span> : null}</div>{item.decision_note ? <p className="mt-2 text-xs text-ink/50">{item.decision_note}</p> : null}</div>{item.status === "SUBMITTED" ? <button disabled={busy === item.id} onClick={() => withdrawRequest(item.id)} className="btn-secondary">Withdraw</button> : null}</div></div>)}</div>}
      </section>
    </div>

    <section className="panel overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="section-heading">Your offers</h2><p className="mt-1 text-sm text-ink/50">Negotiated premium-domain offers and purchase windows.</p></div>
      {loading ? <div className="p-5"><div className="skeleton h-40" /></div> : offers.length === 0 ? <div className="p-6"><p className="text-sm text-ink/50">You have not made a premium-domain offer.</p><Link href="/domains/premium" className="btn-secondary mt-4">Browse marketplace</Link></div> : <div className="divide-y divide-border">{offers.map((offer) => <div key={offer.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><Link href={`/domains/premium/${offer.premium_domain_id}`} className="font-bold hover:text-brand-600">{offer.domainName}</Link><p className="mt-1 text-sm text-ink/55">Your offer: {money(offer.amount_cents, offer.currency)} · Asking: {money(offer.askingPriceCents, offer.currency)}</p>{offer.counter_amount_cents != null ? <p className="mt-1 text-sm font-semibold">Counter: {money(offer.counter_amount_cents, offer.currency)}</p> : null}{offer.accepted_price_cents != null ? <p className="mt-1 text-sm font-semibold text-success">Accepted price: {money(offer.accepted_price_cents, offer.currency)}</p> : null}<div className="mt-2 flex flex-wrap gap-2"><Status status={offer.status} />{offer.expires_at && ["COUNTERED", "ACCEPTED"].includes(offer.status) ? <span className="badge-neutral">Until {new Date(offer.expires_at).toLocaleString()}</span> : null}</div></div><div className="flex flex-wrap gap-2">{offer.status === "COUNTERED" ? <button disabled={busy === offer.id} onClick={() => offerAction(offer.id, "ACCEPT_COUNTER")} className="btn-primary">Accept counter</button> : null}{offer.status === "ACCEPTED" ? <button disabled={busy === offer.id} onClick={() => checkoutOffer(offer.id)} className="btn-primary">Complete purchase</button> : null}{["PENDING", "COUNTERED", "ACCEPTED"].includes(offer.status) ? <button disabled={busy === offer.id} onClick={() => offerAction(offer.id, "WITHDRAW")} className="btn-secondary">Withdraw</button> : null}</div></div></div>)}</div>}
    </section>
  </div>;
}

function Status({ status }: { status: string }) { const cls = status === "APPROVED" || status === "ACCEPTED" || status === "PURCHASED" ? "badge-success" : status === "REJECTED" || status === "EXPIRED" ? "badge-danger" : status === "WITHDRAWN" ? "badge-neutral" : "badge-warning"; return <span className={cls}>{status.replace(/_/g, " ")}</span>; }
function money(cents: number, currency: string) { return (Number(cents) / 100).toLocaleString(undefined, { style: "currency", currency }); }
