"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HostingService = {
  id: string;
  status: string;
  productName: string;
  billingCycle: string;
  domainName: string | null;
  createdAt: string;
  billing: null | {
    id: string;
    status: string | null;
    currentPeriodEnd: string | null;
    nextBillingAt: string | null;
    graceUntil: string | null;
    autoRenew: boolean | null;
    cancelAtPeriodEnd: boolean | null;
    amountCents: number | null;
    currency: string | null;
  };
  live: null | {
    username: string;
    domain: string;
    planCode: string | null;
    suspended: boolean;
    diskUsedMb: number | null;
    diskLimitMb: number | null;
    email: string | null;
    serverIp: string | null;
  };
  liveError: string | null;
};

type HostingData = {
  provider: { configured: boolean; verified: boolean; reason: string | null; lastTestedAt: string | null };
  services: HostingService[];
};

function money(cents: number | null, currency = "USD") {
  if (cents == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
}
function statusClass(status: string) {
  if (status === "ACTIVE") return "badge-success";
  if (["SUSPENDED", "PAST_DUE", "SUSPENSION_PENDING"].includes(status)) return "badge-warning";
  if (["TERMINATED", "EXPIRED", "FAILED", "CANCELLED"].includes(status)) return "badge-danger";
  return "badge-neutral";
}

export default function HostingDashboardPage() {
  const [data, setData] = useState<HostingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");
  const [renewalBusy, setRenewalBusy] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/hosting", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load hosting services.");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load hosting services.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function openCpanel(serviceId: string) {
    setOpening(serviceId);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/hosting/${serviceId}/session`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create a cPanel session.");
      if (!body.url) throw new Error("WHM did not return a cPanel session URL.");
      window.location.href = body.url;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open cPanel.");
      setOpening("");
    }
  }

  async function setAutoRenew(serviceId: string, enabled: boolean) {
    if (!enabled) {
      const confirmed = window.confirm("Turn off automatic renewal? Your hosting will remain active through the paid period and will then be suspended unless you renew it.");
      if (!confirmed) return;
    }
    setRenewalBusy(serviceId);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/hosting/${serviceId}/auto-renew`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update hosting renewal settings.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update hosting renewal settings.");
    } finally {
      setRenewalBusy("");
    }
  }

  if (loading) return <main className="max-w-6xl"><h1 className="text-2xl font-semibold">Web Hosting</h1><p className="mt-4 text-sm text-ink/60">Loading hosting services…</p></main>;
  if (!data) return <main className="max-w-6xl"><h1 className="text-2xl font-semibold">Web Hosting</h1><div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error || "Hosting services could not be loaded."}</div></main>;

  return (
    <main className="max-w-6xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium">My Services</p>
          <h1 className="text-3xl font-bold">Web Hosting</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">Manage provider-backed cPanel hosting, usage, renewal status and secure control-panel access from GetSawa.</p>
        </div>
        <Link href="/products/hosting" className="btn-primary">Browse hosting plans</Link>
      </div>

      {!data.provider.verified ? (
        <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">
          Live WHM management is temporarily unavailable. Existing billing records remain visible, but GetSawa will not claim the provider is operational until its live verification passes again.{data.provider.reason ? ` ${data.provider.reason}` : ""}
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}

      {data.services.length === 0 ? (
        <div className="empty-state">
          <h2 className="text-xl font-bold">No hosting services yet</h2>
          <p className="mt-2 max-w-lg text-sm text-ink/55">Hosting appears here only after a paid order has been successfully provisioned with the configured WHM provider.</p>
          <Link href="/products/hosting" className="btn-primary mt-5">View hosting plans</Link>
        </div>
      ) : (
        <div className="space-y-5">
          {data.services.map((service) => {
            const diskPercent = service.live?.diskUsedMb != null && service.live?.diskLimitMb
              ? Math.min(100, Math.max(0, Math.round((service.live.diskUsedMb / service.live.diskLimitMb) * 100)))
              : null;
            return (
              <article key={service.id} className="card p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold">{service.domainName || service.productName}</h2>
                      <span className={statusClass(service.status)}>{service.status.replaceAll("_", " ")}</span>
                      {service.billing?.status && service.billing.status !== service.status ? <span className={statusClass(service.billing.status)}>{service.billing.status.replaceAll("_", " ")} billing</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-ink/55">{service.productName} · {service.billingCycle.toLowerCase()}</p>
                    {service.liveError ? <p className="mt-2 text-xs text-danger">Live provider check: {service.liveError}</p> : null}
                  </div>
                  <button type="button" onClick={() => void openCpanel(service.id)} disabled={opening === service.id || service.status !== "ACTIVE" || !data.provider.verified} className="btn-secondary shrink-0 disabled:opacity-50">
                    {opening === service.id ? "Opening…" : "Open cPanel"}
                  </button>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="WHM plan" value={service.live?.planCode || "—"} />
                  <Metric label="Server IP" value={service.live?.serverIp || "—"} />
                  <Metric label="Current period ends" value={date(service.billing?.currentPeriodEnd ?? null)} />
                  <Metric label="Renewal" value={service.billing ? money(service.billing.amountCents, service.billing.currency || "USD") : "One-time"} />
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-4"><p className="font-semibold">Disk usage</p><p className="text-sm text-ink/60">{service.live?.diskUsedMb == null ? "Unavailable" : `${Math.round(service.live.diskUsedMb)} MB${service.live.diskLimitMb == null ? "" : ` / ${Math.round(service.live.diskLimitMb)} MB`}`}</p></div>
                    {diskPercent != null ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-border"><div className="h-full bg-current" style={{ width: `${diskPercent}%` }} /></div> : null}
                  </div>
                  <div className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-semibold">Billing status</p>
                    {service.billing ? (
                      <div className="mt-2 space-y-2 text-ink/60">
                        <p>Automatic renewal: {service.billing.autoRenew ? "Enabled" : "Disabled"}</p>
                        <p>Next invoice check: {date(service.billing.nextBillingAt)}</p>
                        {service.billing.cancelAtPeriodEnd ? <p className="text-amber-700">Scheduled to end after the paid period on {date(service.billing.currentPeriodEnd)}.</p> : null}
                        {service.billing.graceUntil ? <p className="text-amber-700">Payment grace until {date(service.billing.graceUntil)}</p> : null}
                        {!(["EXPIRED", "CANCELLED"].includes(service.billing.status || "")) ? (
                          <button type="button" onClick={() => void setAutoRenew(service.id, !service.billing?.autoRenew)} disabled={renewalBusy === service.id} className="btn-secondary mt-2 disabled:opacity-50">
                            {renewalBusy === service.id ? "Saving…" : service.billing.autoRenew ? "Turn off auto-renew" : "Re-enable auto-renew"}
                          </button>
                        ) : null}
                      </div>
                    ) : <p className="mt-2 text-ink/60">No recurring subscription is attached to this service.</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p><p className="mt-2 break-words font-semibold">{value}</p></div>;
}
