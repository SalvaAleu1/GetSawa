"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { computeSafeRetailPrice, PricingSafetyPolicy } from "@/lib/pricing-safety";

interface TldRow {
  id: string;
  extension: string;
  isActive: boolean;
  supportsPremium: boolean;
  wholesaleRegisterCents: number | null;
  wholesaleRenewCents: number | null;
  wholesaleTransferCents: number | null;
  wholesaleUpdatedAt: string | null;
  currency: string;
  computedPrice: {
    registerCents: number;
    renewCents: number;
    transferCents: number | null;
    wholesaleAvailable: boolean;
  };
}

function dollarsToCents(value: string): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export default function AdminPricingPage() {
  const [policy, setPolicy] = useState<PricingSafetyPolicy | null>(null);
  const [tlds, setTlds] = useState<TldRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [policyRes, tldRes] = await Promise.all([
      fetch("/api/admin/pricing-policy"),
      fetch("/api/admin/tlds"),
    ]);
    const [policyData, tldData] = await Promise.all([policyRes.json(), tldRes.json()]);
    if (!policyRes.ok) throw new Error(policyData.error || "Could not load pricing policy.");
    if (!tldRes.ok) throw new Error(tldData.error || "Could not load TLD pricing.");
    setPolicy(policyData.policy);
    setTlds(tldData.tlds || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function savePolicy() {
    if (!policy) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save pricing policy.");
      setPolicy(data.policy);
      setMessage("Pricing policy saved. New searches and checkouts will use it immediately.");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function syncWholesale() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wholesale sync failed.");
      setMessage(`Wholesale sync complete: ${data.result.updated}/${data.result.requested} active TLDs updated from ${data.result.provider}.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  const previews = useMemo(() => {
    if (!policy) return [];
    return [1_000, 10_000, 100_000, 1_000_000].map((wholesale) => {
      const result = computeSafeRetailPrice(wholesale, policy);
      return { wholesale, ...result };
    });
  }, [policy]);

  if (!policy) {
    return <div><h1 className="text-2xl font-semibold">Pricing & Margins</h1><p className="mt-4 text-sm text-ink/60">{error || "Loading pricing controls…"}</p></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/40">Commerce controls</p>
          <h1 className="mt-1 text-3xl font-semibold">Pricing & Margins</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink/60">
            GetSawa calculates domain retail prices from registrar wholesale cost, margin rules, payment cost and FX reserve. Promotions cannot cross the protected price floor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={syncWholesale} disabled={syncing} className="btn-secondary">{syncing ? "Syncing…" : "Sync registrar prices"}</button>
          <button onClick={savePolicy} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save policy"}</button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="card p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Payment fee</span>
          <div className="mt-3 flex items-center gap-2"><input className="input" type="number" step="0.01" value={policy.paymentFeePercent} onChange={(e) => setPolicy({ ...policy, paymentFeePercent: Number(e.target.value) })} /><span className="text-sm">%</span></div>
          <div className="mt-2 flex items-center gap-2"><span className="text-sm">+</span><input className="input" type="number" step="0.01" value={(policy.paymentFixedFeeCents / 100).toFixed(2)} onChange={(e) => setPolicy({ ...policy, paymentFixedFeeCents: dollarsToCents(e.target.value) })} /><span className="text-sm">USD</span></div>
        </label>
        <label className="card p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">FX safety reserve</span>
          <div className="mt-3 flex items-center gap-2"><input className="input" type="number" step="0.01" value={policy.fxBufferPercent} onChange={(e) => setPolicy({ ...policy, fxBufferPercent: Number(e.target.value) })} /><span className="text-sm">%</span></div>
          <p className="mt-2 text-xs text-ink/45">Protects supplier cost against settlement/currency movement.</p>
        </label>
        <label className="card p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Minimum profit</span>
          <div className="mt-3 flex items-center gap-2"><span className="text-sm">$</span><input className="input" type="number" step="0.01" value={(policy.minimumProfitCents / 100).toFixed(2)} onChange={(e) => setPolicy({ ...policy, minimumProfitCents: dollarsToCents(e.target.value) })} /></div>
          <p className="mt-2 text-xs text-ink/45">Absolute profit floor before any discount is accepted.</p>
        </label>
        <label className="card p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Minimum margin</span>
          <div className="mt-3 flex items-center gap-2"><input className="input" type="number" step="0.01" value={policy.minimumMarginPercent} onChange={(e) => setPolicy({ ...policy, minimumMarginPercent: Number(e.target.value) })} /><span className="text-sm">%</span></div>
          <p className="mt-2 text-xs text-ink/45">Used together with the tier markup and minimum profit.</p>
        </label>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-6 py-5">
          <h2 className="font-semibold">Automatic markup tiers</h2>
          <p className="mt-1 text-sm text-ink/55">Lower-cost domains can carry a larger percentage; high-value premium domains automatically use a smaller percentage while retaining a dollar floor.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-ink/[0.03] text-left text-xs uppercase tracking-wide text-ink/45"><tr><th className="px-5 py-3">Wholesale from</th><th className="px-5 py-3">Wholesale to</th><th className="px-5 py-3">Markup</th><th className="px-5 py-3">Minimum markup</th></tr></thead>
            <tbody className="divide-y divide-border">
              {policy.markupTiers.map((tier, index) => (
                <tr key={index}>
                  <td className="px-5 py-3"><input className="input max-w-36" type="number" step="0.01" value={(tier.minWholesaleCents / 100).toFixed(2)} onChange={(e) => { const tiers = [...policy.markupTiers]; tiers[index] = { ...tier, minWholesaleCents: dollarsToCents(e.target.value) }; setPolicy({ ...policy, markupTiers: tiers }); }} /></td>
                  <td className="px-5 py-3">{tier.maxWholesaleCents == null ? <span className="text-ink/45">No limit</span> : <input className="input max-w-36" type="number" step="0.01" value={(tier.maxWholesaleCents / 100).toFixed(2)} onChange={(e) => { const tiers = [...policy.markupTiers]; tiers[index] = { ...tier, maxWholesaleCents: dollarsToCents(e.target.value) }; setPolicy({ ...policy, markupTiers: tiers }); }} />}</td>
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><input className="input max-w-28" type="number" step="0.01" value={tier.markupPercent} onChange={(e) => { const tiers = [...policy.markupTiers]; tiers[index] = { ...tier, markupPercent: Number(e.target.value) }; setPolicy({ ...policy, markupTiers: tiers }); }} /><span>%</span></div></td>
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><span>$</span><input className="input max-w-32" type="number" step="0.01" value={(tier.minimumMarkupCents / 100).toFixed(2)} onChange={(e) => { const tiers = [...policy.markupTiers]; tiers[index] = { ...tier, minimumMarkupCents: dollarsToCents(e.target.value) }; setPolicy({ ...policy, markupTiers: tiers }); }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><h2 className="font-semibold">Margin preview</h2><p className="text-sm text-ink/55">Illustrative output from the current policy before any TLD-specific higher configured retail price.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {previews.map((preview) => (
            <div key={preview.wholesale} className="card p-5">
              <p className="text-xs uppercase tracking-wide text-ink/45">Wholesale {formatCents(preview.wholesale)}</p>
              <p className="mt-2 text-2xl font-semibold">{formatCents(preview.retailCents)}</p>
              <dl className="mt-4 space-y-1 text-xs text-ink/55"><div className="flex justify-between"><dt>FX reserve</dt><dd>{formatCents(preview.fxReserveCents)}</dd></div><div className="flex justify-between"><dt>Payment estimate</dt><dd>{formatCents(preview.estimatedPaymentFeeCents)}</dd></div><div className="flex justify-between"><dt>Estimated profit</dt><dd>{formatCents(preview.estimatedProfitCents)}</dd></div></dl>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Registrar cost monitor</h2><p className="mt-1 text-sm text-ink/55">Cached supplier costs are refreshed automatically every six hours; checkout refreshes them again before payment.</p></div><span className="text-xs text-ink/45">{tlds.filter((t) => t.isActive).length} active TLDs</span></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-ink/[0.03] text-left text-xs uppercase tracking-wide text-ink/45"><tr><th className="px-5 py-3">TLD</th><th className="px-5 py-3">Wholesale</th><th className="px-5 py-3">Protected retail</th><th className="px-5 py-3">Premium risk</th><th className="px-5 py-3">Last sync</th></tr></thead>
            <tbody className="divide-y divide-border">
              {tlds.map((tld) => (
                <tr key={tld.id}>
                  <td className="px-5 py-3 font-semibold">.{tld.extension}</td>
                  <td className="px-5 py-3">{tld.wholesaleRegisterCents == null ? "—" : formatCents(tld.wholesaleRegisterCents, tld.currency)}</td>
                  <td className="px-5 py-3">{formatCents(tld.computedPrice.registerCents, tld.currency)}</td>
                  <td className="px-5 py-3">{tld.supportsPremium ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Exact quote required</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Standard pricing</span>}</td>
                  <td className="px-5 py-3 text-xs text-ink/50">{tld.wholesaleUpdatedAt ? new Date(tld.wholesaleUpdatedAt).toLocaleString() : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
