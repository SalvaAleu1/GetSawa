"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";

interface AuctionRow {
  id: string; title: string; domainName: string; status: string; startAt: string; endAt: string; isFeatured: boolean;
  currentBidCents: number; startingBidCents: number; bidCount: number; renewalPriceCents: number; currency: string;
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "LIVE" | "SCHEDULED" | "ENDED">("ALL");

  useEffect(() => {
    fetch("/api/auctions", { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load auctions."); setAuctions(data.auctions || []); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load auctions."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => auctions.filter((auction) => filter === "ALL" || (filter === "ENDED" ? ["ENDED","PAID","COMPLETED"].includes(auction.status) : auction.status === filter)), [auctions, filter]);

  return <><Navbar /><main className="bg-paper py-10 lg:py-14"><div className="shell-container">
    <div className="max-w-3xl"><p className="eyebrow">Verified domain inventory</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Domain auctions</h1><p className="mt-3 text-sm leading-6 text-ink/55">Bid on domains whose custody has been verified before the auction opens. Winning bids are paid through GetSawa and ownership is delivered only after registrar confirmation.</p></div>
    <div className="mt-7 flex flex-wrap gap-2">{(["ALL","LIVE","SCHEDULED","ENDED"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "btn-primary" : "btn-secondary"}>{item === "ALL" ? "All auctions" : item.toLowerCase()}</button>)}</div>
    {error ? <div className="mt-6 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {loading ? <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="skeleton h-56" />)}</div> : visible.length === 0 ? <div className="empty-state mt-7"><p className="text-lg font-bold">No auctions match this view.</p><p className="mt-2 text-sm text-ink/50">Verified auction inventory will appear here when it is scheduled or live.</p></div> : <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((auction) => <Link key={auction.id} href={`/domains/auctions/${auction.id}`} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold">{auction.domainName}</p><p className="mt-1 text-xs text-ink/45">{auction.title}</p></div>{auction.isFeatured ? <span className="badge-warning">Featured</span> : null}</div><div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/40">{auction.bidCount > 0 ? "Current bid" : "Starting bid"}</p><p className="mt-1 text-2xl font-bold">{money(auction.currentBidCents, auction.currency)}</p><p className="mt-1 text-xs text-ink/45">{auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}</p></div><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs"><Status value={auction.status} /><span className="text-ink/45">{auction.status === "LIVE" ? `Ends ${new Date(auction.endAt).toLocaleString()}` : auction.status === "SCHEDULED" ? `Starts ${new Date(auction.startAt).toLocaleString()}` : "Auction closed"}</span></div><p className="mt-3 text-xs text-ink/40">Renewal estimate {money(auction.renewalPriceCents, auction.currency)}/year</p></Link>)}</div>}
  </div></main><SiteFooter /></>;
}

function Status({ value }: { value: string }) { const cls = value === "LIVE" || value === "COMPLETED" ? "badge-success" : value === "SCHEDULED" || value === "ENDED" || value === "PAID" ? "badge-warning" : "badge-neutral"; return <span className={cls}>{value.replace(/_/g," ")}</span>; }
function money(cents: number, currency = "USD") { return (Number(cents || 0) / 100).toLocaleString(undefined, { style: "currency", currency }); }
