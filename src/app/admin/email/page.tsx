"use client";

import { useEffect, useState } from "react";

type Service = {
  id: string;
  status: string;
  provider_resource_id: string;
  created_at: string;
  customer_email: string;
  first_name: string;
  last_name: string;
  product_name: string;
  billing_cycle: string;
  domain_name: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  auto_renew: boolean | null;
  email_domain_status: string | null;
  liveStatus: string | null;
  liveError: string | null;
};

type Data = { provider: { verified: boolean; reason: string | null; cluster: string | null }; services: Service[] };
function date(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—"; }

export default function AdminEmailPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/email", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load mailbox inventory.");
      setData(body.data ?? body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load mailbox inventory."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function changeStatus(service: Service, action: "SUSPEND" | "REACTIVATE") {
    if (action === "SUSPEND" && !window.confirm(`Suspend ${service.provider_resource_id}? IMAP, POP, inbound mail, SMTP relay and webmail will be suspended at OpenSRS.`)) return;
    setBusy(service.id); setError("");
    try {
      const response = await fetch(`/api/admin/email/${service.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update mailbox status.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update mailbox status."); }
    finally { setBusy(""); }
  }

  if (loading) return <div><h1 className="text-2xl font-semibold">Business Email</h1><p className="mt-4 text-sm text-ink/60">Loading mailbox operations…</p></div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Business Email</h1><p className="mt-1 text-sm text-ink/60">OpenSRS Hosted Email inventory, customer linkage, billing and operational controls.</p></div>
    {error ? <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {data && !data.provider.verified ? <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">OpenSRS is not currently verified. Provider-changing actions are disabled.{data.provider.reason ? ` ${data.provider.reason}` : ""}</div> : null}
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="Mailboxes" value={String(data?.services.length ?? 0)} /><Metric label="Active locally" value={String(data?.services.filter((service) => service.status === "ACTIVE").length ?? 0)} /><Metric label="Provider" value={data?.provider.verified ? `Operational · Cluster ${data.provider.cluster}` : "Not verified"} /></div>
    {(data?.services.length ?? 0) === 0 ? <div className="empty-state"><h2 className="text-xl font-bold">No mailbox services</h2><p className="mt-2 text-sm text-ink/55">Provider-backed mailbox services appear here after successful paid provisioning.</p></div> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead className="border-b bg-muted"><tr><th className="p-4">Mailbox</th><th className="p-4">Customer</th><th className="p-4">Plan</th><th className="p-4">DNS</th><th className="p-4">Billing</th><th className="p-4">Provider</th><th className="p-4">Action</th></tr></thead><tbody>{data?.services.map((service) => <tr key={service.id} className="border-b last:border-0 align-top"><td className="p-4"><p className="font-semibold">{service.provider_resource_id}</p><p className="mt-1 text-xs text-ink/45">{service.status} · created {date(service.created_at)}</p></td><td className="p-4"><p>{service.first_name} {service.last_name}</p><p className="text-xs text-ink/50">{service.customer_email}</p></td><td className="p-4"><p>{service.product_name}</p><p className="text-xs text-ink/50">{service.billing_cycle.toLowerCase()}</p></td><td className="p-4"><p>{service.email_domain_status || "—"}</p><p className="text-xs text-ink/50">{service.domain_name || "No domain"}</p></td><td className="p-4"><p>{service.subscription_status || "One-time"}</p><p className="text-xs text-ink/50">{service.current_period_end ? `Ends ${date(service.current_period_end)}` : ""}{service.auto_renew != null ? ` · auto-renew ${service.auto_renew ? "on" : "off"}` : ""}</p></td><td className="p-4"><p>{service.liveStatus || (data?.provider.verified ? "Unknown" : "Not checked")}</p>{service.liveError ? <p className="mt-1 text-xs text-danger">{service.liveError}</p> : null}</td><td className="p-4">{service.status === "TERMINATED" ? <span className="text-xs text-ink/45">No action</span> : <button type="button" className="btn-secondary" disabled={busy === service.id || !data?.provider.verified} onClick={() => void changeStatus(service, service.status === "SUSPENDED" ? "REACTIVATE" : "SUSPEND")}>{busy === service.id ? "Saving…" : service.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>}</td></tr>)}</tbody></table></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="card p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink/45">{label}</p><p className="mt-2 font-semibold">{value}</p></div>; }
