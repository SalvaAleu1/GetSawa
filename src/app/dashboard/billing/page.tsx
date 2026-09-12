"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Subscription {
  id: string;
  domainId: string | null;
  serviceInstanceId: string | null;
  serviceLabel: string;
  serviceKind: "DOMAIN" | "WEB_HOSTING" | "BUSINESS_EMAIL" | "SERVICE";
  serviceProvider: string | null;
  status: string;
  billingCycle: string;
  amountCents: number;
  currency: string;
  currentPeriodEnd: string;
  nextBillingAt: string;
  autoRenew: boolean;
  failedPaymentCount: number;
}
interface Renewal {
  id: string;
  status: string;
  order_id: string | null;
  domain_name: string | null;
  service_domain_name?: string | null;
  product_name?: string | null;
  service_address?: string | null;
  service_provider?: string | null;
  scheduled_at: string;
  period_end: string;
  order_total_cents?: number | null;
  order_currency?: string | null;
  order_status?: string | null;
}
interface Invoice { id: string; invoiceNumber: string; orderId: string; totalCents: number; currency: string; status: string; paidAt: string | null; createdAt: string; }
interface BillingData {
  subscriptions: Subscription[];
  renewals: Renewal[];
  invoices: Invoice[];
  creditBalanceCents: number;
  availableCreditCents: number;
  paymentMethods: { paypal: { enabled: boolean }; directCardGateway: { enabled: boolean; reason: string } };
}

function money(cents: number, currency = "USD") { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100); }
function date(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
function kindLabel(kind: Subscription["serviceKind"]) {
  if (kind === "WEB_HOSTING") return "Web hosting";
  if (kind === "BUSINESS_EMAIL") return "Business email";
  if (kind === "DOMAIN") return "Domain";
  return "Recurring service";
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard/billing", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load billing.");
      setData(body.data ?? body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load billing.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function toggleDomain(id: string, enabled: boolean) {
    setBusy(id); setError("");
    try {
      const response = await fetch(`/api/dashboard/billing/domains/${id}/auto-renew`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update renewal automation.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update renewal automation.");
    } finally { setBusy(""); }
  }

  async function pay(orderId: string) {
    setBusy(orderId); setError("");
    try {
      const response = await fetch(`/api/dashboard/billing/orders/${orderId}/pay`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to start payment.");
      const approveUrl = body.data?.approveUrl ?? body.approveUrl;
      if (!approveUrl) throw new Error("PayPal did not return an approval URL.");
      window.location.href = approveUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start payment.");
      setBusy("");
    }
  }

  if (loading) return <main className="mx-auto max-w-6xl p-6"><p>Loading billing…</p></main>;
  if (error && !data) return <main className="mx-auto max-w-6xl p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></main>;

  const subscriptions = data?.subscriptions ?? [];
  const renewals = data?.renewals ?? [];
  const invoices = data?.invoices ?? [];
  const availableCredit = data?.availableCreditCents ?? 0;
  const totalCredit = data?.creditBalanceCents ?? 0;
  const reservedCredit = Math.max(0, totalCredit - availableCredit);

  return <main className="mx-auto max-w-6xl space-y-8 p-6">
    <header>
      <p className="text-sm font-medium">Account</p>
      <h1 className="text-3xl font-bold">Billing & renewals</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">Review domain, web-hosting and business-email renewals, protected invoices, payments and account credits. Renewal prices are revalidated against the correct provider contract before payment.</p>
    </header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border p-5"><p className="text-sm text-gray-500">Available GetSawa credit</p><p className="mt-2 text-2xl font-semibold">{money(availableCredit)}</p><p className="mt-1 text-xs text-gray-500">{reservedCredit > 0 ? `${money(reservedCredit)} is reserved by a pending checkout.` : "No credit is currently reserved by another checkout."}</p></div>
      <div className="rounded-2xl border p-5"><p className="text-sm text-gray-500">PayPal</p><p className="mt-2 text-lg font-semibold">{data?.paymentMethods.paypal.enabled ? "Available" : "Unavailable"}</p><p className="mt-1 text-xs text-gray-500">Payment availability is verified server-side before handoff.</p></div>
      <div className="rounded-2xl border p-5"><p className="text-sm text-gray-500">Direct card gateway</p><p className="mt-2 text-lg font-semibold">Not configured</p><p className="mt-1 text-xs text-gray-500">We do not show a direct-card option until a production gateway is genuinely enabled.</p></div>
    </section>

    <section className="space-y-3">
      <div><h2 className="text-xl font-semibold">Recurring services</h2><p className="mt-1 text-sm text-gray-600">Each service keeps its own registrar/provider lifecycle while sharing one protected GetSawa billing history.</p></div>
      {subscriptions.length === 0 ? <div className="rounded-xl border p-6 text-sm text-gray-600">No recurring services are currently attached to your account.</div> :
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="border-b bg-gray-50"><tr><th className="p-4">Service</th><th className="p-4">Renewal</th><th className="p-4">Period ends</th><th className="p-4">Invoice check</th><th className="p-4">Automation</th></tr></thead><tbody>
          {subscriptions.map((subscription) => <tr key={subscription.id} className="border-b last:border-0">
            <td className="p-4 font-medium">{subscription.serviceLabel}<div className="text-xs font-normal text-gray-500">{kindLabel(subscription.serviceKind)} · {subscription.status}</div></td>
            <td className="p-4">{money(subscription.amountCents, subscription.currency)}<div className="text-xs text-gray-500">Final price revalidated before payment</div></td>
            <td className="p-4">{date(subscription.currentPeriodEnd)}</td>
            <td className="p-4">{date(subscription.nextBillingAt)}</td>
            <td className="p-4">{subscription.domainId ? <button disabled={busy === subscription.domainId} onClick={() => void toggleDomain(subscription.domainId!, !subscription.autoRenew)} className="rounded-md border px-3 py-1.5 font-medium disabled:opacity-50">{busy === subscription.domainId ? "Saving…" : subscription.autoRenew ? "Enabled" : "Disabled"}</button> : subscription.serviceKind === "WEB_HOSTING" ? <Link href="/dashboard/hosting" className="text-xs font-semibold text-brand-600">Manage in Web Hosting</Link> : subscription.serviceKind === "BUSINESS_EMAIL" ? <Link href="/dashboard/email" className="text-xs font-semibold text-brand-600">Manage in Business Email</Link> : <span className="text-xs text-gray-500">Managed by provider</span>}</td>
          </tr>)}
        </tbody></table></div>}
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Renewal invoices</h2>
      {renewals.length === 0 ? <div className="rounded-xl border p-6 text-sm text-gray-600">No renewal invoices have been generated.</div> : <div className="space-y-3">{renewals.map((renewal) => {
        const label = renewal.service_provider === "opensrs_hosted_email" ? renewal.service_address : renewal.domain_name ?? renewal.service_domain_name ?? renewal.product_name ?? renewal.service_address ?? "Renewal";
        return <div key={renewal.id} className="flex flex-col gap-4 rounded-xl border p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{label || "Renewal"}</p><p className="text-sm text-gray-600">Period end: {date(renewal.period_end)} · {renewal.status}</p>{renewal.order_total_cents != null && <p className="mt-1 text-sm font-medium">{money(Number(renewal.order_total_cents), renewal.order_currency ?? "USD")}</p>}</div>{renewal.order_id && ["ORDER_CREATED", "FAILED"].includes(renewal.status) && <button disabled={busy === renewal.order_id} onClick={() => void pay(renewal.order_id!)} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy === renewal.order_id ? "Refreshing price…" : "Refresh price & pay"}</button>}</div>;
      })}</div>}
    </section>

    <section className="space-y-3"><h2 className="text-xl font-semibold">Invoice history</h2>{invoices.length === 0 ? <div className="rounded-xl border p-6 text-sm text-gray-600">No invoices yet.</div> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="border-b bg-gray-50"><tr><th className="p-4">Invoice</th><th className="p-4">Date</th><th className="p-4">Amount</th><th className="p-4">Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-b last:border-0"><td className="p-4 font-medium">{invoice.invoiceNumber}</td><td className="p-4">{date(invoice.createdAt)}</td><td className="p-4">{money(invoice.totalCents, invoice.currency)}</td><td className="p-4">{invoice.status}</td></tr>)}</tbody></table></div>}</section>
  </main>;
}
