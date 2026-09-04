"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface AuctionRow {
  id: string;
  title: string;
  domainName: string;
  status: string;
  startAt: string;
  endAt: string;
  startingBidCents: number;
  isFeatured: boolean;
  _count: { bids: number };
}

export default function AdminAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [form, setForm] = useState({
    title: "",
    domainName: "",
    startingBidCents: "",
    reservePriceCents: "",
    minIncrementCents: "25",
    startAt: "",
    endAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/auctions");
    const data = await res.json();
    setAuctions(data.auctions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          domainName: form.domainName,
          startingBidCents: Math.round(Number(form.startingBidCents) * 100),
          reservePriceCents: form.reservePriceCents ? Math.round(Number(form.reservePriceCents) * 100) : undefined,
          minIncrementCents: Math.round(Number(form.minIncrementCents) * 100),
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create auction.");
      setForm({ title: "", domainName: "", startingBidCents: "", reservePriceCents: "", minIncrementCents: "25", startAt: "", endAt: "" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(id: string, action: string) {
    await fetch(`/api/admin/auctions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Auctions</h1>

      <div className="card mt-6 divide-y divide-border">
        {auctions.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-semibold">{a.domainName} <span className="ml-2 text-xs text-ink/40">{a._count.bids} bids</span></p>
              <p className="text-xs text-ink/50">Starting {formatCents(a.startingBidCents)} · ends {new Date(a.endAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge-neutral">{a.status}</span>
              <button onClick={() => runAction(a.id, a.isFeatured ? "unfeature" : "feature")} className="btn-secondary">
                {a.isFeatured ? "Unfeature" : "Feature"}
              </button>
              {["LIVE", "SCHEDULED"].includes(a.status) && (
                <>
                  <button onClick={() => runAction(a.id, "close")} className="btn-secondary">Close now</button>
                  <button onClick={() => runAction(a.id, "cancel")} className="btn-danger">Cancel</button>
                </>
              )}
            </div>
          </div>
        ))}
        {auctions.length === 0 && <p className="p-5 text-sm text-ink/60">No auctions yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">Create an auction</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Title</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Domain</label>
            <input className="input" required placeholder="example.com" value={form.domainName} onChange={(e) => setForm({ ...form, domainName: e.target.value })} />
          </div>
          <div>
            <label className="label">Starting bid ($)</label>
            <input className="input" required value={form.startingBidCents} onChange={(e) => setForm({ ...form, startingBidCents: e.target.value })} />
          </div>
          <div>
            <label className="label">Reserve price ($, optional)</label>
            <input className="input" value={form.reservePriceCents} onChange={(e) => setForm({ ...form, reservePriceCents: e.target.value })} />
          </div>
          <div>
            <label className="label">Minimum increment ($)</label>
            <input className="input" value={form.minIncrementCents} onChange={(e) => setForm({ ...form, minIncrementCents: e.target.value })} />
          </div>
          <div />
          <div>
            <label className="label">Starts</label>
            <input className="input" type="datetime-local" required value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
          </div>
          <div>
            <label className="label">Ends</label>
            <input className="input" type="datetime-local" required value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creating…" : "Create auction"}</button>
      </form>
    </div>
  );
}
