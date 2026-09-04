"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface Tld {
  id: string;
  extension: string;
  isActive: boolean;
  isFeatured: boolean;
  pricingMethod: string;
  wholesaleRegisterCents: number | null;
  wholesaleRenewCents: number | null;
  markupPercent: string | null;
  markupFixedCents: number | null;
  fixedRegisterCents: number | null;
  fixedRenewCents: number | null;
  currency: string;
  computedPrice: { registerCents: number; renewCents: number };
}

const emptyForm = {
  extension: "",
  pricingMethod: "WHOLESALE_PLUS_PERCENT",
  wholesaleRegisterCents: "",
  wholesaleRenewCents: "",
  markupPercent: "20",
  markupFixedCents: "",
  fixedRegisterCents: "",
  fixedRenewCents: "",
  isActive: true,
  isFeatured: false,
};

export default function AdminTldsPage() {
  const [tlds, setTlds] = useState<Tld[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/tlds");
    const data = await res.json();
    setTlds(data.tlds || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        extension: form.extension,
        pricingMethod: form.pricingMethod,
        isActive: form.isActive,
        isFeatured: form.isFeatured,
      };
      if (form.wholesaleRegisterCents) payload.wholesaleRegisterCents = Math.round(Number(form.wholesaleRegisterCents) * 100);
      if (form.wholesaleRenewCents) payload.wholesaleRenewCents = Math.round(Number(form.wholesaleRenewCents) * 100);
      if (form.markupPercent) payload.markupPercent = Number(form.markupPercent);
      if (form.markupFixedCents) payload.markupFixedCents = Math.round(Number(form.markupFixedCents) * 100);
      if (form.fixedRegisterCents) payload.fixedRegisterCents = Math.round(Number(form.fixedRegisterCents) * 100);
      if (form.fixedRenewCents) payload.fixedRenewCents = Math.round(Number(form.fixedRenewCents) * 100);

      const res = await fetch("/api/admin/tlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create TLD.");
      setForm(emptyForm);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(tld: Tld) {
    await fetch(`/api/admin/tlds/${tld.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !tld.isActive }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">TLD Manager</h1>
      <p className="mt-1 text-sm text-ink/60">Control which extensions are sellable and how their retail price is computed — no code changes required.</p>

      <div className="card mt-6 divide-y divide-border">
        {tlds.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-semibold">.{t.extension}</p>
              <p className="text-xs text-ink/50">
                {t.pricingMethod} · Register {formatCents(t.computedPrice.registerCents, t.currency)} · Renew {formatCents(t.computedPrice.renewCents, t.currency)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {t.isFeatured && <span className="badge-warning">Featured</span>}
              <button onClick={() => toggleActive(t)} className={t.isActive ? "btn-secondary" : "btn-primary"}>
                {t.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {tlds.length === 0 && <p className="p-5 text-sm text-ink/60">No TLDs configured yet — add one below.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">Add a TLD</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Extension</label>
            <input className="input" placeholder="com" required value={form.extension} onChange={(e) => setForm({ ...form, extension: e.target.value })} />
          </div>
          <div>
            <label className="label">Pricing method</label>
            <select className="input" value={form.pricingMethod} onChange={(e) => setForm({ ...form, pricingMethod: e.target.value })}>
              <option value="WHOLESALE_PLUS_PERCENT">Wholesale + % markup</option>
              <option value="WHOLESALE_PLUS_FIXED">Wholesale + fixed markup</option>
              <option value="FIXED">Fixed price</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} /> Featured
            </label>
          </div>
        </div>

        {form.pricingMethod.startsWith("WHOLESALE") ? (
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label">Wholesale register ($/yr)</label>
              <input className="input" value={form.wholesaleRegisterCents} onChange={(e) => setForm({ ...form, wholesaleRegisterCents: e.target.value })} />
            </div>
            <div>
              <label className="label">Wholesale renew ($/yr)</label>
              <input className="input" value={form.wholesaleRenewCents} onChange={(e) => setForm({ ...form, wholesaleRenewCents: e.target.value })} />
            </div>
            {form.pricingMethod === "WHOLESALE_PLUS_PERCENT" ? (
              <div>
                <label className="label">Markup %</label>
                <input className="input" value={form.markupPercent} onChange={(e) => setForm({ ...form, markupPercent: e.target.value })} />
              </div>
            ) : (
              <div>
                <label className="label">Markup ($ fixed)</label>
                <input className="input" value={form.markupFixedCents} onChange={(e) => setForm({ ...form, markupFixedCents: e.target.value })} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Retail register ($/yr)</label>
              <input className="input" value={form.fixedRegisterCents} onChange={(e) => setForm({ ...form, fixedRegisterCents: e.target.value })} />
            </div>
            <div>
              <label className="label">Retail renew ($/yr)</label>
              <input className="input" value={form.fixedRenewCents} onChange={(e) => setForm({ ...form, fixedRenewCents: e.target.value })} />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Add TLD"}</button>
      </form>
    </div>
  );
}
