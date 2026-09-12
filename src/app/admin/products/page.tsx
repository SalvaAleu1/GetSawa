"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface Readiness {
  purchasable: boolean;
  providerReady: boolean;
  fulfillmentReady: boolean;
  pricingReady: boolean;
  billingReady: boolean;
  minimumRetailCents: number | null;
  reasons: string[];
}

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  status: string;
  retailPriceCents: number;
  renewalPriceCents: number | null;
  currency: string;
  billingCycle: string;
  providerName: string | null;
  commerce: {
    wholesaleCostCents: number | null;
    costSource: string;
    provisioningContract: string | null;
    renewalContract: string | null;
  } | null;
  activationReadiness: Readiness;
}

interface BundleRow {
  bundle: { id: string; name: string; productSkus: string[]; bundlePriceCents: number; isActive: boolean };
  readiness: { purchasable: boolean; minimumBundlePriceCents: number | null; reasons: string[] };
}

const CATEGORIES = ["DOMAIN_REGISTRATION", "DOMAIN_TRANSFER", "DOMAIN_RENEWAL", "PREMIUM_DOMAIN", "HOSTING", "EMAIL", "WEBSITE", "SECURITY", "AI", "MARKETING", "ADD_ON"];
const emptyForm = {
  sku: "", name: "", category: "ADD_ON", retailPrice: "", renewalPrice: "", wholesaleCost: "", providerName: "",
  providerProductId: "", provisioningContract: "", renewalContract: "", billingCycle: "ONE_TIME", requiresDomain: false, storageMb: "",
};
const emptyBundle = { name: "", productSkus: "", bundlePrice: "" };

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [bundleForm, setBundleForm] = useState(emptyBundle);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [productRes, bundleRes] = await Promise.all([fetch("/api/admin/products"), fetch("/api/admin/bundles")]);
    const [productData, bundleData] = await Promise.all([productRes.json(), bundleRes.json()]);
    setProducts(productData.products || []);
    setBundles(bundleData.bundles || []);
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const wholesaleCostCents = Math.round(Number(form.wholesaleCost) * 100);
      const renewalPriceCents = form.renewalPrice ? Math.round(Number(form.renewalPrice) * 100) : null;
      if (form.billingCycle !== "ONE_TIME" && (!renewalPriceCents || renewalPriceCents <= 0)) {
        throw new Error("Monthly and yearly products require a positive renewal price.");
      }
      if (form.billingCycle !== "ONE_TIME" && !form.renewalContract) {
        throw new Error("Monthly and yearly products require an implemented renewal contract.");
      }
      if (form.billingCycle === "ONE_TIME" && (form.renewalPrice || form.renewalContract)) {
        throw new Error("One-time products cannot include a recurring renewal price or renewal contract.");
      }

      const providerConfig = form.storageMb ? { storageMb: Number(form.storageMb) } : {};
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          category: form.category,
          retailPriceCents: Math.round(Number(form.retailPrice) * 100),
          renewalPriceCents,
          billingCycle: form.billingCycle,
          providerName: form.providerName || undefined,
          providerProductId: form.providerProductId || undefined,
          commerce: {
            wholesaleCostCents: Number.isFinite(wholesaleCostCents) ? wholesaleCostCents : null,
            wholesaleCurrency: "USD",
            costSource: form.wholesaleCost ? "MANUAL_VERIFIED" : "UNKNOWN",
            requiresDomain: form.requiresDomain,
            providerConfig,
            provisioningContract: form.provisioningContract || null,
            renewalContract: form.renewalContract || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create product.");
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create product.");
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError(null);
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) setError([data.error, ...(data.reasons || [])].filter(Boolean).join(" "));
    await load();
  }

  async function createBundle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const productSkus = bundleForm.productSkus.split(",").map((sku) => sku.trim()).filter(Boolean);
    const res = await fetch("/api/admin/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: bundleForm.name,
        productSkus,
        bundlePriceCents: Math.round(Number(bundleForm.bundlePrice) * 100),
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Could not create bundle.");
    else setBundleForm(emptyBundle);
    await load();
  }

  async function toggleBundle(row: BundleRow) {
    setError(null);
    const res = await fetch(`/api/admin/bundles/${row.bundle.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !row.bundle.isActive }),
    });
    const data = await res.json();
    if (!res.ok) setError([data.error, ...(data.reasons || [])].filter(Boolean).join(" "));
    await load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Products & bundles</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink/60">
          Nothing can go on sale until cost protection, provider readiness, fulfilment and billing all pass. Catalog entries are configuration records, not promises of a live service.
        </p>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Catalog readiness</h2></div>
        <div className="divide-y divide-border">
          {products.map((product) => (
            <div key={product.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.5fr_1fr_auto] lg:items-center">
              <div>
                <p className="font-semibold">{product.name} <span className="ml-2 font-mono text-xs text-ink/40">{product.sku}</span></p>
                <p className="mt-1 text-xs text-ink/50">
                  {product.category} · {formatCents(product.retailPriceCents, product.currency)} · {product.billingCycle}
                  {product.providerName ? ` · ${product.providerName}` : ""}
                </p>
                {product.billingCycle !== "ONE_TIME" && product.renewalPriceCents != null ? (
                  <p className="mt-1 text-xs text-ink/45">Renews at {formatCents(product.renewalPriceCents, product.currency)} · {product.commerce?.renewalContract || "renewal contract missing"}</p>
                ) : null}
              </div>
              <div className="text-xs">
                <div className="flex flex-wrap gap-1.5">
                  <Signal ok={product.activationReadiness.pricingReady}>Pricing</Signal>
                  <Signal ok={product.activationReadiness.providerReady}>Provider</Signal>
                  <Signal ok={product.activationReadiness.fulfillmentReady}>Fulfilment</Signal>
                  <Signal ok={product.activationReadiness.billingReady}>Billing</Signal>
                </div>
                {!product.activationReadiness.purchasable && product.activationReadiness.reasons[0] && (
                  <p className="mt-2 max-w-md text-ink/55">{product.activationReadiness.reasons[0]}</p>
                )}
              </div>
              <div className="flex items-center gap-2 lg:justify-end">
                <StatusPill status={product.status} />
                {product.status !== "ACTIVE" ? (
                  <button onClick={() => void setStatus(product.id, "ACTIVE")} className="btn-primary">Activate</button>
                ) : (
                  <button onClick={() => void setStatus(product.id, "PAUSED")} className="btn-secondary">Pause</button>
                )}
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="p-5 text-sm text-ink/60">No products configured yet.</p>}
        </div>
      </section>

      <form onSubmit={handleCreate} className="card space-y-5 p-6">
        <div>
          <h2 className="font-semibold">Configure a catalog product</h2>
          <p className="mt-1 text-xs text-ink/50">It will be created as Draft. Activation is a separate readiness-gated action.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="SKU"><input className="input" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field>
          <Field label="First-period retail price (USD)"><input className="input" type="number" min="0" step="0.01" required value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} /></Field>
          <Field label="Renewal price (USD)"><input className="input" type="number" min="0.01" step="0.01" disabled={form.billingCycle === "ONE_TIME"} required={form.billingCycle !== "ONE_TIME"} value={form.renewalPrice} onChange={(e) => setForm({ ...form, renewalPrice: e.target.value })} placeholder={form.billingCycle === "ONE_TIME" ? "Not applicable" : "Required for recurring products"} /></Field>
          <Field label="Verified wholesale cost (USD)"><input className="input" type="number" min="0" step="0.01" value={form.wholesaleCost} onChange={(e) => setForm({ ...form, wholesaleCost: e.target.value })} /></Field>
          <Field label="Billing cycle"><select className="input" value={form.billingCycle} onChange={(e) => { const billingCycle = e.target.value; setForm({ ...form, billingCycle, renewalPrice: billingCycle === "ONE_TIME" ? "" : form.renewalPrice, renewalContract: billingCycle === "ONE_TIME" ? "" : form.renewalContract }); }}><option>ONE_TIME</option><option>MONTHLY</option><option>YEARLY</option></select></Field>
          <Field label="Provider"><select className="input" value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value })}><option value="">Not selected</option><option value="cpanel_whm">cPanel / WHM hosting</option><option value="opensrs_hosted_email">OpenSRS Hosted Email</option><option value="ai">AI provider</option><option value="namesilo">NameSilo</option></select></Field>
          <Field label="Provider plan / product code"><input className="input" value={form.providerProductId} onChange={(e) => setForm({ ...form, providerProductId: e.target.value })} /></Field>
          <Field label="Provisioning contract"><select className="input" value={form.provisioningContract} onChange={(e) => setForm({ ...form, provisioningContract: e.target.value })}><option value="">Not implemented</option><option value="HOSTING_ACCOUNT">HOSTING_ACCOUNT</option><option value="EMAIL_MAILBOX">EMAIL_MAILBOX</option></select></Field>
          <Field label="Renewal contract"><select className="input" disabled={form.billingCycle === "ONE_TIME"} value={form.renewalContract} onChange={(e) => setForm({ ...form, renewalContract: e.target.value })}><option value="">Not implemented</option><option value="HOSTING_RENEWAL">HOSTING_RENEWAL</option><option value="EMAIL_RENEWAL">EMAIL_RENEWAL</option></select></Field>
          <Field label="Mailbox storage (MB)"><input className="input" type="number" min="1" value={form.storageMb} onChange={(e) => setForm({ ...form, storageMb: e.target.value })} /></Field>
          <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
            <input type="checkbox" checked={form.requiresDomain} onChange={(e) => setForm({ ...form, requiresDomain: e.target.checked })} />
            Requires a domain in the customer account
          </label>
        </div>
        <p className="text-xs leading-5 text-ink/50">Recurring OpenSRS mailbox plans use provider <strong>opensrs_hosted_email</strong>, provisioning contract <strong>EMAIL_MAILBOX</strong>, renewal contract <strong>EMAIL_RENEWAL</strong>, a verified wholesale cost and a positive mailbox storage limit. The provider live test still decides whether activation is permitted.</p>
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Create draft product"}</button>
      </form>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Bundles</h2></div>
          <div className="divide-y divide-border">
            {bundles.map((row) => (
              <div key={row.bundle.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{row.bundle.name}</p>
                  <p className="text-xs text-ink/50">{row.bundle.productSkus.join(" + ")} · {formatCents(row.bundle.bundlePriceCents)}</p>
                  {!row.readiness.purchasable && row.readiness.reasons[0] && <p className="mt-1 text-xs text-ink/55">{row.readiness.reasons[0]}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={row.bundle.isActive ? "ACTIVE" : "DRAFT"} />
                  <button className={row.bundle.isActive ? "btn-secondary" : "btn-primary"} onClick={() => void toggleBundle(row)}>{row.bundle.isActive ? "Pause" : "Activate"}</button>
                </div>
              </div>
            ))}
            {bundles.length === 0 && <p className="p-5 text-sm text-ink/60">No bundles configured yet.</p>}
          </div>
        </div>

        <form onSubmit={createBundle} className="card space-y-4 p-6">
          <div><h2 className="font-semibold">Create bundle</h2><p className="mt-1 text-xs text-ink/50">Bundles start inactive and inherit every component’s readiness requirements.</p></div>
          <Field label="Bundle name"><input className="input" required value={bundleForm.name} onChange={(e) => setBundleForm({ ...bundleForm, name: e.target.value })} /></Field>
          <Field label="Product SKUs (comma separated)"><input className="input" required placeholder="HOST-STARTER, EMAIL-5GB" value={bundleForm.productSkus} onChange={(e) => setBundleForm({ ...bundleForm, productSkus: e.target.value })} /></Field>
          <Field label="Bundle price (USD)"><input className="input" type="number" min="0.01" step="0.01" required value={bundleForm.bundlePrice} onChange={(e) => setBundleForm({ ...bundleForm, bundlePrice: e.target.value })} /></Field>
          <button type="submit" className="btn-primary">Create inactive bundle</button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function Signal({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={ok ? "badge-success" : "badge-neutral"}>{children}</span>;
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "ACTIVE" ? "badge-success" : status === "PROVIDER_ERROR" ? "badge-danger" : "badge-neutral";
  return <span className={cls}>{status.replace(/_/g, " ")}</span>;
}
