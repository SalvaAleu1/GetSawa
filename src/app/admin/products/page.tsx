"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  status: string;
  retailPriceCents: number;
  currency: string;
  providerName: string | null;
}

const CATEGORIES = ["DOMAIN_REGISTRATION", "DOMAIN_TRANSFER", "DOMAIN_RENEWAL", "PREMIUM_DOMAIN", "HOSTING", "EMAIL", "WEBSITE", "SECURITY", "AI", "MARKETING", "ADD_ON"];

const emptyForm = { sku: "", name: "", category: "ADD_ON", retailPriceCents: "", providerName: "" };

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/products");
    const data = await res.json();
    setProducts(data.products || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          category: form.category,
          retailPriceCents: Math.round(Number(form.retailPriceCents) * 100),
          providerName: form.providerName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create product.");
      setForm(emptyForm);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
    }
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Products</h1>
      <p className="mt-1 text-sm text-ink/60">
        A product can only be Active if its provider dependency is configured — nothing goes on sale that can't actually be delivered.
      </p>

      <div className="card mt-6 divide-y divide-border">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-semibold">{p.name} <span className="ml-2 text-xs font-mono text-ink/40">{p.sku}</span></p>
              <p className="text-xs text-ink/50">{p.category} · {formatCents(p.retailPriceCents, p.currency)} {p.providerName ? `· requires ${p.providerName}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={p.status} />
              {p.status !== "ACTIVE" ? (
                <button onClick={() => setStatus(p.id, "ACTIVE")} className="btn-primary">Activate</button>
              ) : (
                <button onClick={() => setStatus(p.id, "PAUSED")} className="btn-secondary">Pause</button>
              )}
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="p-5 text-sm text-ink/60">No products yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">Add a product</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">SKU</label>
            <input className="input" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Retail price ($)</label>
            <input className="input" required value={form.retailPriceCents} onChange={(e) => setForm({ ...form, retailPriceCents: e.target.value })} />
          </div>
          <div>
            <label className="label">Provider dependency (optional)</label>
            <select className="input" value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value })}>
              <option value="">None</option>
              <option value="namesilo">namesilo</option>
              <option value="hosting">hosting</option>
              <option value="email">email</option>
              <option value="ai">ai</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Create product (draft)"}</button>
      </form>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "ACTIVE" ? "badge-success" : status === "PROVIDER_ERROR" ? "badge-danger" : "badge-neutral";
  return <span className={cls}>{status.replace(/_/g, " ")}</span>;
}
