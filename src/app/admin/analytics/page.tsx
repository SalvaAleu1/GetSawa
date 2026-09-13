"use client";

import { useEffect, useState } from "react";

type Data = any;

function money(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

function pct(value: number) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function Card({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {note ? <p className="mt-1 text-xs text-ink/50">{note}</p> : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const [from, setFrom] = useState(dateInput(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(dateInput(new Date()));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const end = new Date(`${to}T23:59:59.999Z`).toISOString();
      const start = new Date(`${from}T00:00:00.000Z`).toISOString();
      const response = await fetch(
        `/api/admin/analytics?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load analytics.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial range is intentionally loaded once; later changes are applied by the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportUrl = `/api/admin/analytics/export?from=${encodeURIComponent(
    new Date(`${from}T00:00:00.000Z`).toISOString(),
  )}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999Z`).toISOString())}`;

  return (
    <main className="max-w-7xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Operations &amp; Finance</p>
          <h1 className="text-3xl font-bold">Analytics &amp; Observability</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink/60">
            Authoritative business, finance, provider, API, scheduled-job and reconciliation evidence from GetSawa production tables.
          </p>
        </div>
        <a href={exportUrl} className="btn-secondary">
          Export finance CSV
        </a>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          From
          <input
            className="input mt-1"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          To
          <input
            className="input mt-1"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button className="btn-primary" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Apply range"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {!data ? null : (
        <>
          <section>
            <h2 className="text-xl font-semibold">Finance</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card label="Gross captured" value={money(data.finance.grossCents)} />
              <Card label="Refunded" value={money(data.finance.refundedCents)} />
              <Card label="Provider fees" value={money(data.finance.providerFeesCents)} />
              <Card label="Net settlement" value={money(data.finance.netCents)} />
              <Card label="Disputes" value={data.finance.disputes} />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Business &amp; growth</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Card label="New customers" value={data.business.newCustomers} />
              <Card label="Orders" value={data.business.orders} />
              <Card label="Paid invoices" value={data.business.paidInvoices} />
              <Card label="Active domains" value={data.business.activeDomains} />
              <Card label="Campaign clicks" value={data.growth.clicks} />
              <Card
                label="Conversion rate"
                value={pct(data.growth.conversionRate)}
                note={`${data.growth.conversions} paid conversions`}
              />
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="text-lg font-semibold">Reliability</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Card label="API requests" value={data.api.requests} />
                <Card label="API errors" value={data.api.errors} />
                <Card label="API p95" value={`${Math.round(data.api.p95Ms)} ms`} />
                <Card label="Cron failures" value={`${data.jobs.failed} / ${data.jobs.runs}`} />
              </div>
            </div>
            <div className="card p-5">
              <h2 className="text-lg font-semibold">Reconciliation</h2>
              <div className="mt-4 space-y-2 text-sm">
                <Row
                  label="Paid payments missing capture finance event"
                  value={data.reconciliation.paidWithoutCaptureEvent}
                />
                <Row
                  label="Completed refunds missing finance event"
                  value={data.reconciliation.refundsWithoutEvent}
                />
                <Row
                  label="Failed provider webhooks"
                  value={data.reconciliation.failedProviderWebhooks}
                />
                <Row
                  label="Dead developer webhooks"
                  value={data.reconciliation.deadDeveloperWebhooks}
                />
                <Row
                  label="Failed transactional messages"
                  value={data.reconciliation.failedMessages}
                />
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Product revenue &amp; current-cost margin estimate</h2>
              <p className="mt-1 text-xs text-ink/50">
                Estimated cost uses the currently verified wholesale catalog cost; rows with missing cost units are explicitly flagged.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3">Product</th>
                    <th className="p-3">Units</th>
                    <th className="p-3">Revenue</th>
                    <th className="p-3">Est. cost</th>
                    <th className="p-3">Est. margin</th>
                    <th className="p-3">Missing cost units</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product: any) => (
                    <tr key={product.productId} className="border-b last:border-0">
                      <td className="p-3">
                        <b>{product.name}</b>
                        <div className="text-xs text-ink/45">
                          {product.sku} · {product.category}
                        </div>
                      </td>
                      <td className="p-3">{product.units}</td>
                      <td className="p-3">{money(product.revenueCents)}</td>
                      <td className="p-3">{money(product.estimatedCostCents)}</td>
                      <td className="p-3">{money(product.estimatedMarginCents)}</td>
                      <td className="p-3">{product.missingCostUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold">Signup cohorts</h2>
                <p className="text-xs text-ink/50">
                  Activation = first paid invoice within 30 days of signup.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-3">Month</th>
                      <th className="p-3">Customers</th>
                      <th className="p-3">Activated</th>
                      <th className="p-3">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((cohort: any) => (
                      <tr key={cohort.month} className="border-b last:border-0">
                        <td className="p-3">
                          {new Date(cohort.month).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td className="p-3">{cohort.customers}</td>
                        <td className="p-3">{cohort.activated30d}</td>
                        <td className="p-3">{pct(cohort.activationRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold">Provider health</h2>
              </div>
              <div className="divide-y">
                {data.providers.map((provider: any) => (
                  <div
                    key={provider.provider}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-medium">{provider.provider}</p>
                      <p className="text-xs text-ink/45">
                        {provider.lastTestedAt
                          ? `Last tested ${new Date(provider.lastTestedAt).toLocaleString()}`
                          : "Not live-tested"}
                      </p>
                    </div>
                    <span className={provider.lastTestOk ? "badge-success" : "badge-warning"}>
                      {provider.lastTestOk ? "Healthy" : "Needs attention"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">Top application errors</h2>
            </div>
            {data.errors.length === 0 ? (
              <p className="p-5 text-sm text-ink/55">
                No recorded unhandled application errors in this range.
              </p>
            ) : (
              <div className="divide-y">
                {data.errors.map((item: any) => (
                  <div key={item.fingerprint} className="p-4">
                    <div className="flex justify-between gap-3">
                      <p className="font-medium">
                        {item.errorName}: {item.message}
                      </p>
                      <span className="badge-neutral">{item.count}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-ink/40">
                      {item.fingerprint.slice(0, 16)}… · latest {new Date(item.latest).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink/60">{label}</span>
      <span className={value > 0 ? "badge-warning" : "badge-success"}>{value}</span>
    </div>
  );
}
