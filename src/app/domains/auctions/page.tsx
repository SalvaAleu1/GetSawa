"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { formatCents } from "@/lib/money";

interface AuctionRow {
  id: string;
  title: string;
  domainName: string;
  status: string;
  endAt: string;
  isFeatured: boolean;
  currentBidCents: number;
  bidCount: number;
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auctions").then((r) => r.json()).then((d) => setAuctions(d.auctions || [])).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Domain Auctions</h1>
        <p className="mt-1 text-sm text-ink/60">Bid on premium domains. Highest bid wins when the auction closes.</p>

        {loading ? (
          <p className="mt-6 text-ink/60">Loading…</p>
        ) : auctions.length === 0 ? (
          <p className="mt-6 text-ink/60">No auctions running right now.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {auctions.map((a) => (
              <Link key={a.id} href={`/domains/auctions/${a.id}`} className="card p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{a.domainName}</p>
                  {a.isFeatured && <span className="badge-warning">Featured</span>}
                </div>
                <p className="mt-2 text-sm text-ink/60">{a.bidCount} bid{a.bidCount === 1 ? "" : "s"}</p>
                <p className="mt-1 text-lg font-semibold">{formatCents(a.currentBidCents)}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {a.status === "ENDED" ? "Auction ended" : `Ends ${new Date(a.endAt).toLocaleString()}`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
