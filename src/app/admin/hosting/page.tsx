"use client";

import { useEffect, useState } from "react";

type HostingAdminData = {
  provider: { configured: boolean; verified: boolean; reason: string | null; lastTestedAt: string | null };
  services: Array<{
    id: string;
    status: string;
    createdAt: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    productName: string;
    domainName: string | null;
    billingStatus: string | null;
    currentPeriodEnd: string | null;
    graceUntil: string | null;
  }>;
};

function badge(status: string | null) {
  if (!status) return "badge-neutral";
  if (status === "ACTIVE") return "badge-success";
  if (["SUSPENDED", "PAST_DUE"].includes(status)) return "badge-warning";
  if (["TERMINATED", "FAILED", "EXPIRED"].includes(status)) return "badge-danger";
  return "badge-neutral";
}

export default function AdminHostingPage() {
  const [data, setData] = useState<HostingAdminData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/admin/hosting", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load hosting operations.");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load hosting operations.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function changeStatus(id: string, action: "SUSPEND" | "UNSUSPEND") {
    const reason = action === "SUSPEND" ? window.prompt("Optional suspension reason:") ?? "" : "";
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/hosting/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update hosting service.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update hosting service.");
    } finally {
      setBusy("");
    }
  }

  if (!data) return <div><h1 className="text-2xl font-semibold">Web Hosting</h1><p className="mt-4 text-sm text-ink/60">Loading hosting operations…</p>{error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}</div>;

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-medium">Operations</p>
        <h1 className="text-3xl font-bold">Web Hosting</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">WHM-backed hosting inventory, billing state and suspension controls. Provider credentials are never exposed here.</p>
      </header>

      <div className={`rounded-2xl border p-4 text-sm ${data.provider.verified ? "border-success/20 bg-success/5" : "border-amber-300/50 bg-amber-50"}`}>
        <p className="font-semibold">WHM provider: {data.provider.verified ? "Operational" : data.provider.configured ? "Configured but not verified" : "Not configured"}</p>
        {data.provider.reason ? <p className="mt-1 text-ink/60">{data.provider.reason}</p> : null}
        {data.provider.lastTestedAt ? <p className="mt-1 text-xs text-ink/45">Last tested {new Date(data.provider.lastTestedAt).toLocaleString()}</p> : null}
      </div>

      {error ? <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-paper"><tr><th className="p-4">Service</th><th className="p-4">Customer</th><th className="p-4">Hosting</th><th className="p-4">Billing</th><th className="p-4">Period</th><th className="p-4">Actions</th></tr></thead>
          <tbody>
            {data.services.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-ink/55">No WHM hosting services have been provisioned.</td></tr> : data.services.map((service) => (
              <tr key={service.id} className="border-b border-border last:border-0">
                <td className="p-4"><p className="font-semibold">{service.domainName || service.productName}</p><p className="text-xs text-ink/45">{service.productName}</p></td>
                <td className="p-4"><p>{service.customerName}</p><p className="text-xs text-ink/45">{service.customerEmail}</p></td>
                <td className="p-4"><span className={badge(service.status)}>{service.status}</span></td>
                <td className="p-4"><span className={badge(service.billingStatus)}>{service.billingStatus || "ONE_TIME"}</span>{service.graceUntil ? <p className="mt-1 text-xs text-amber-700">Grace until {new Date(service.graceUntil).toLocaleDateString()}</p> : null}</td>
                <td className="p-4">{service.currentPeriodEnd ? new Date(service.currentPeriodEnd).toLocaleDateString() : "—"}</td>
                <td className="p-4">
                  {service.status === "ACTIVE" ? <button disabled={busy === service.id || !data.provider.verified} onClick={() => void changeStatus(service.id, "SUSPEND")} className="btn-secondary disabled:opacity-50">{busy === service.id ? "Saving…" : "Suspend"}</button> : service.status === "SUSPENDED" ? <button disabled={busy === service.id || !data.provider.verified} onClick={() => void changeStatus(service.id, "UNSUSPEND")} className="btn-secondary disabled:opacity-50">{busy === service.id ? "Saving…" : "Reactivate"}</button> : <span className="text-xs text-ink/45">No action</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
