"use client";

import { useEffect, useState } from "react";

interface Promotion {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  isStackable: boolean;
}

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    newCustomerOnly: false,
    targetKind: "DOMAIN_REGISTRATION",
    targetTlds: "com",
    effectType: "FREE_ITEM",
    percent: "50",
    excludePremium: true,
    priority: "10",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/promotions");
    const data = await res.json();
    setPromotions(data.promotions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const conditions = form.newCustomerOnly ? [{ field: "customer.isNew", op: "eq", value: true }] : [];
      const effects = [
        {
          type: form.effectType,
          targetKind: form.targetKind,
          targetTlds: form.targetTlds.split(",").map((s) => s.trim()).filter(Boolean),
          excludePremium: form.excludePremium,
          ...(form.effectType === "PERCENT_OFF_ITEM" ? { percent: Number(form.percent) } : {}),
        },
      ];

      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          isActive: true,
          priority: Number(form.priority),
          rules: { conditionLogic: "AND", conditions, effects },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create promotion.");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(p: Promotion) {
    await fetch(`/api/admin/promotions/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Promotions</h1>
      <p className="mt-1 text-sm text-ink/60">Rule-based promotions, evaluated server-side at checkout. Premium domains are excluded by default.</p>

      <div className="card mt-6 divide-y divide-border">
        {promotions.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
            <p className="font-medium">{p.name} <span className="ml-2 text-xs text-ink/40">priority {p.priority}</span></p>
            <button onClick={() => toggleActive(p)} className={p.isActive ? "btn-secondary" : "btn-primary"}>
              {p.isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {promotions.length === 0 && <p className="p-5 text-sm text-ink/60">No promotions yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">Create a promotion</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" required placeholder="Launch offer" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Priority (higher wins)</label>
            <input className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </div>
          <div>
            <label className="label">Applies to TLDs (comma-separated)</label>
            <input className="input" value={form.targetTlds} onChange={(e) => setForm({ ...form, targetTlds: e.target.value })} />
          </div>
          <div>
            <label className="label">Effect</label>
            <select className="input" value={form.effectType} onChange={(e) => setForm({ ...form, effectType: e.target.value })}>
              <option value="FREE_ITEM">Free (100% off)</option>
              <option value="PERCENT_OFF_ITEM">Percent off</option>
            </select>
          </div>
          {form.effectType === "PERCENT_OFF_ITEM" && (
            <div>
              <label className="label">Percent off</label>
              <input className="input" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
            </div>
          )}
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.newCustomerOnly} onChange={(e) => setForm({ ...form, newCustomerOnly: e.target.checked })} /> New customers only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.excludePremium} onChange={(e) => setForm({ ...form, excludePremium: e.target.checked })} /> Exclude premium domains
            </label>
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Create promotion"}</button>
      </form>
    </div>
  );
}
