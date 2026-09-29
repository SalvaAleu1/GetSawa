"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { readJsonResponse } from "@/lib/client-response";

interface Tld {
  id: string;
  extension: string;
  isActive: boolean;
  isFeatured: boolean;
  supportsPremium: boolean;
  pricingMethod: string;
  wholesaleRegisterCents: number | null;
  wholesaleRenewCents: number | null;
  wholesaleTransferCents: number | null;
  wholesaleUpdatedAt: string | null;
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
  markupPercent: "20",
  markupFixedCents: "",
  fixedRegisterCents: "",
  fixedRenewCents: "",
  isActive: false,
  isFeatured: false,
};

function normalizedExtension(value: string) {
  return value.trim().toLowerCase().replace(/^\./, "");
}

export default function AdminTldsPage() {
  const [tlds, setTlds] = useState<Tld[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const existingTld = useMemo(() => {
    const extension = normalizedExtension(form.extension);
    return extension ? tlds.find((tld) => tld.extension === extension) || null : null;
  }, [form.extension, tlds]);

  async function load() {
    const res = await fetch("/api/admin/tlds", { cache: "no-store" });
    const data = await readJsonResponse<{ tlds?: Tld[] }>(res, "Could not load TLD configuration");
    setTlds(data.tlds || []);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load TLD configuration."));
  }, []);

  function editTld(tld: Tld) {
    setError(null);
    setNotice(null);
    setForm({
      extension: tld.extension,
      pricingMethod: tld.pricingMethod,
      markupPercent: tld.markupPercent || "",
      markupFixedCents: tld.markupFixedCents == null ? "" : (tld.markupFixedCents / 100).toFixed(2),
      fixedRegisterCents: tld.fixedRegisterCents == null ? "" : (tld.fixedRegisterCents / 100).toFixed(2),
      fixedRenewCents: tld.fixedRenewCents == null ? "" : (tld.fixedRenewCents / 100).toFixed(2),
      isActive: tld.isActive,
      isFeatured: tld.isFeatured,
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const payload: Record<string, unknown> = {
        pricingMethod: form.pricingMethod,
        isActive: form.isActive,
        isFeatured: form.isFeatured,
      };

      if (form.pricingMethod === "WHOLESALE_PLUS_PERCENT") {
        payload.markupPercent = Number(form.markupPercent || 0);
        payload.markupFixedCents = null;
      } else if (form.pricingMethod === "WHOLESALE_PLUS_FIXED") {
        payload.markupFixedCents = Math.round(Number(form.markupFixedCents || 0) * 100);
        payload.markupPercent = null;
      } else {
        payload.fixedRegisterCents = Math.round(Number(form.fixedRegisterCents || 0) * 100);
        payload.fixedRenewCents = Math.round(Number(form.fixedRenewCents || 0) * 100);
      }

      let res: Response;
      if (existingTld) {
        res = await fetch(`/api/admin/tlds/${existingTld.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/admin/tlds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extension: form.extension,
            ...payload,
          }),
        });
      }

      await readJsonResponse(res, existingTld ? "Could not update TLD" : "Could not create TLD");
      const savedExtension = normalizedExtension(form.extension);
      setNotice(existingTld ? `.${savedExtension} updated.` : `.${savedExtension} added.`);
      setForm(emptyForm);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save TLD.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(tld: Tld) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tlds/${tld.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !tld.isActive }),
      });
      await readJsonResponse(res, "Could not update TLD status");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update TLD status.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">TLD Manager</h1>
      <p className="mt-1 text-sm text-ink/60">
        Control which extensions are sellable and how retail prices are calculated. Registrar wholesale costs are synchronized automatically.
      </p>

      {notice && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="card mt-6 divide-y divide-border">
        {tlds.map((t) => (
          <div key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">.{t.extension}</p>
                {t.supportsPremium && <span className="badge-warning">Premium-capable</span>}
                {t.isFeatured && <span className="badge-warning">Featured</span>}
              </div>
              <p className="mt-1 text-xs text-ink/50">
                {t.pricingMethod} · Register {formatCents(t.computedPrice.registerCents, t.currency)} · Renew {formatCents(t.computedPrice.renewCents, t.currency)}
              </p>
              <p className="mt-1 text-xs text-ink/45">
                Wholesale {t.wholesaleRegisterCents == null ? "not synced" : formatCents(t.wholesaleRegisterCents, t.currency)}
                {" · "}
                Last sync {t.wholesaleUpdatedAt ? new Date(t.wholesaleUpdatedAt).toLocaleString() : "never"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => editTld(t)} className="btn-secondary">Edit</button>
              <button type="button" onClick={() => toggleActive(t)} className={t.isActive ? "btn-secondary" : "btn-primary"}>
                {t.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {tlds.length === 0 && <p className="p-5 text-sm text-ink/60">No TLDs configured yet.</p>}
      </div>

      <form onSubmit={handleSave} className="card mt-6 space-y-4 p-6">
        <div>
          <h2 className="font-semibold">{existingTld ? `Edit .${existingTld.extension}` : "Add a TLD"}</h2>
          {existingTld && <p className="mt-1 text-xs text-ink/50">This extension already exists. Saving updates the existing record; it will not create a duplicate.</p>}
        </div>

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
          <div className="rounded-xl border border-border bg-ink/[0.02] p-4">
            <p className="text-sm font-medium">Wholesale cost comes from the registrar</p>
            <p className="mt-1 text-xs text-ink/50">
              Do not enter NameSilo wholesale register or renewal prices manually. Use Pricing & Margins → Sync registrar prices after the NameSilo live connection passes.
            </p>
            <div className="mt-4 max-w-sm">
              {form.pricingMethod === "WHOLESALE_PLUS_PERCENT" ? (
                <div>
                  <label className="label">Markup %</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.markupPercent} onChange={(e) => setForm({ ...form, markupPercent: e.target.value })} />
                </div>
              ) : (
                <div>
                  <label className="label">Markup ($ fixed)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.markupFixedCents} onChange={(e) => setForm({ ...form, markupFixedCents: e.target.value })} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Retail register ($/yr)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.fixedRegisterCents} onChange={(e) => setForm({ ...form, fixedRegisterCents: e.target.value })} />
            </div>
            <div>
              <label className="label">Retail renew ($/yr)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.fixedRenewCents} onChange={(e) => setForm({ ...form, fixedRenewCents: e.target.value })} />
            </div>
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving…" : existingTld ? "Update TLD" : "Add TLD"}
        </button>
      </form>
    </div>
  );
}
