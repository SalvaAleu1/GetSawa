"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface Listing {
  id: string;
  domainName: string;
  purchasePriceCents: number;
  renewalPriceCents: number;
  status: string;
  isFeatured: boolean;
}

export default function AdminPremiumDomainsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [form, setForm] = useState({ domainName: "", purchasePriceCents: "", renewalPriceCents: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/premium-domains");
    const data = await res.json();
    setListings(data.listings || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/premium-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainName: form.domainName,
          purchasePriceCents: Math.round(Number(form.purchasePriceCents) * 100),
          renewalPriceCents: Math.round(Number(form.renewalPriceCents || form.purchasePriceCents) * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create listing.");
      setForm({ domainName: "", purchasePriceCents: "", renewalPriceCents: "" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(l: Listing, field: "isFeatured" | "status") {
    const body = field === "isFeatured" ? { isFeatured: !l.isFeatured } : { status: l.status === "LISTED" ? "DELISTED" : "LISTED" };
    await fetch(`/api/admin/premium-domains/${l.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Premium Domains</h1>

      <div className="card mt-6 divide-y divide-border">
        {listings.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-semibold">{l.domainName}</p>
              <p className="text-xs text-ink/50">{formatCents(l.purchasePriceCents)} · renews {formatCents(l.renewalPriceCents)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={l.status === "LISTED" ? "badge-success" : "badge-neutral"}>{l.status}</span>
              <button onClick={() => toggle(l, "isFeatured")} className="btn-secondary">{l.isFeatured ? "Unfeature" : "Feature"}</button>
              <button onClick={() => toggle(l, "status")} className="btn-secondary">{l.status === "LISTED" ? "Delist" : "Relist"}</button>
            </div>
          </div>
        ))}
        {listings.length === 0 && <p className="p-5 text-sm text-ink/60">No listings yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">List a premium domain</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Domain</label>
            <input className="input" required placeholder="invest.com" value={form.domainName} onChange={(e) => setForm({ ...form, domainName: e.target.value })} />
          </div>
          <div>
            <label className="label">Purchase price ($)</label>
            <input className="input" required value={form.purchasePriceCents} onChange={(e) => setForm({ ...form, purchasePriceCents: e.target.value })} />
          </div>
          <div>
            <label className="label">Renewal price ($, optional)</label>
            <input className="input" value={form.renewalPriceCents} onChange={(e) => setForm({ ...form, renewalPriceCents: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "List domain"}</button>
      </form>
    </div>
  );
}
