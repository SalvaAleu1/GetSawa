"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { formatCents } from "@/lib/money";

interface AuctionDetail {
  id: string;
  title: string;
  domainName: string;
  status: string;
  endAt: string;
  startingBidCents: number;
  minIncrementCents: number;
  reservePriceCents: number | null;
  paymentDeadline: string | null;
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [bids, setBids] = useState<{ id: string; amountCents: number; bidder: string }[]>([]);
  const [isWinner, setIsWinner] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/auctions/${id}`);
    const data = await res.json();
    if (res.ok) {
      setAuction(data.auction);
      setBids(data.bids);
      setIsWinner(data.isWinner);
    }
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleBid(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const amountCents = Math.round(Number(amount) * 100);
      const res = await fetch(`/api/auctions/${id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bid failed.");
      setAmount("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePay() {
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${id}/pay/create-order`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start payment.");
      if (data.approveUrl) window.location.href = data.approveUrl;
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!auction) return <><Navbar /><main className="mx-auto max-w-2xl px-6 py-12 text-ink/60">Loading…</main></>;

  const currentBid = bids[0]?.amountCents ?? auction.startingBidCents;
  const minNext = currentBid + auction.minIncrementCents;
  const ended = auction.status === "ENDED" || auction.status === "PAID";

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">{auction.domainName}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {ended ? "This auction has ended." : `Ends ${new Date(auction.endAt).toLocaleString()}`}
        </p>

        <div className="card mt-6 p-6">
          <p className="text-sm text-ink/60">Current bid</p>
          <p className="text-3xl font-semibold">{formatCents(currentBid)}</p>

          {!ended && (
            <form onSubmit={handleBid} className="mt-4 flex gap-2">
              <input
                className="input"
                type="number"
                step="0.01"
                min={minNext / 100}
                placeholder={`${(minNext / 100).toFixed(2)} or more`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
                {submitting ? "Placing…" : "Place bid"}
              </button>
            </form>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          {isWinner && auction.status === "ENDED" && (
            <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
              <p className="font-medium text-success">You won this auction!</p>
              {auction.paymentDeadline && (
                <p className="mt-1 text-sm text-ink/60">Pay by {new Date(auction.paymentDeadline).toLocaleString()} to claim the domain.</p>
              )}
              <button onClick={handlePay} className="btn-primary mt-3">Pay now with PayPal</button>
            </div>
          )}
        </div>

        <div className="card mt-6 divide-y divide-border">
          <p className="px-5 py-3 text-sm font-medium text-ink/60">Bid history</p>
          {bids.map((b) => (
            <div key={b.id} className="flex justify-between px-5 py-3 text-sm">
              <span>{b.bidder}</span>
              <span className="font-medium">{formatCents(b.amountCents)}</span>
            </div>
          ))}
          {bids.length === 0 && <p className="px-5 py-3 text-sm text-ink/60">No bids yet.</p>}
        </div>
      </main>
    </>
  );
}
