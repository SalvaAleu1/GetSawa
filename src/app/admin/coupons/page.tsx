"use client";

import { useEffect, useState } from "react";

interface Coupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  timesUsed: number;
  usageLimit: number | null;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ code: "", discountType: "PERCENT", discountValue: "10", usageLimit: "", newCustomerOnly: false });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/coupons");
    const data = await res.json();
    setCoupons(data.coupons || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const discountValue = form.discountType === "FIXED" ? Math.round(Number(form.discountValue) * 100) : Number(form.discountValue);
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discountType: form.discountType,
          discountValue,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          newCustomerOnly: form.newCustomerOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create coupon.");
      setForm({ code: "", discountType: "PERCENT", discountValue: "10", usageLimit: "", newCustomerOnly: false });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Coupons</h1>

      <div className="card mt-6 divide-y divide-border">
        {coupons.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-mono font-semibold">{c.code}</p>
              <p className="text-xs text-ink/50">
                {c.discountType === "PERCENT" ? `${c.discountValue}% off` : `$${(c.discountValue / 100).toFixed(2)} off`} · used {c.timesUsed}
                {c.usageLimit ? `/${c.usageLimit}` : ""}
              </p>
            </div>
            <span className={c.isActive ? "badge-success" : "badge-neutral"}>{c.isActive ? "Active" : "Inactive"}</span>
          </div>
        ))}
        {coupons.length === 0 && <p className="p-5 text-sm text-ink/60">No coupons yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">Create a coupon</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Code</label>
            <input className="input" required placeholder="LAUNCH50" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
              <option value="PERCENT">Percent</option>
              <option value="FIXED">Fixed ($)</option>
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <input className="input" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
          </div>
          <div>
            <label className="label">Usage limit (optional)</label>
            <input className="input" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.newCustomerOnly} onChange={(e) => setForm({ ...form, newCustomerOnly: e.target.checked })} /> New customers only
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Create coupon"}</button>
      </form>
    </div>
  );
}
