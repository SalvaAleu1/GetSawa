"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Transfer {
  id: string;
  domainId: string | null;
  domainName: string;
  status: string;
  failureReason: string | null;
  providerTransferId: string | null;
  createdAt: string;
  updatedAt: string;
  ageDays: number;
  actionRequired: string | null;
  order: { orderNumber: string; status: string; totalCents: number; currency: string; createdAt: string } | null;
}

interface Stats { total: number; active: number; attention: number; completed: number; }
const EMPTY: Stats = { total: 0, active: 0, attention: 0, completed: 0 };

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/transfers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load transfers.");
      setTransfers(data.transfers || []); setStats(data.stats || EMPTY);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load transfers."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh(id: string) {
    setBusyId(id); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/transfers/${id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not refresh transfer status.");
      setNotice(`Registrar status refreshed${data.providerStatus ? `: ${data.providerStatus}` : "."}`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not refresh transfer status."); } finally { setBusyId(null); }
  }

  async function action(id: string, type: "CHANGE_EPP" | "RESEND_EMAIL" | "RESUBMIT") {
    setBusyId(id); setError(null); setNotice(null);
    try {
      const body = type === "CHANGE_EPP" ? { action: type, authCode } : { action: type };
      const res = await fetch(`/api/dashboard/transfers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer recovery action failed.");
      setNotice(data.message || "Transfer recovery action accepted.");
      setEditing(null); setAuthCode(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Transfer recovery action failed."); } finally { setBusyId(null); }
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Domain transfers</p><h1 className="page-heading mt-2">Transfer Manager</h1><p className="page-subtitle">Track incoming transfers, refresh registrar status, and recover common EPP or verification problems without exposing transfer secrets.</p></div><Link href="/domains/transfer" className="btn-primary">Transfer another domain</Link></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total" value={stats.total} /><Metric label="In progress" value={stats.active} /><Metric label="Needs attention" value={stats.attention} tone={stats.attention ? "warning" : "normal"} /><Metric label="Completed" value={stats.completed} /></div>
      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

      {loading ? <div className="skeleton h-72" /> : transfers.length === 0 ? <div className="empty-state"><p className="text-lg font-semibold">No transfers yet.</p><p className="mt-2 text-sm text-ink/55">Start by checking a domain&apos;s live transfer eligibility.</p><Link href="/domains/transfer" className="btn-primary mt-5">Start a transfer</Link></div> : (
        <div className="space-y-4">{transfers.map((transfer) => <article key={transfer.id} className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{transfer.domainName}</h2><span className={statusClass(transfer.status)}>{transfer.status.replace(/_/g, " ")}</span></div><p className="mt-2 text-xs text-ink/45">Started {new Date(transfer.createdAt).toLocaleString()} · {transfer.ageDays} day{transfer.ageDays === 1 ? "" : "s"} old{transfer.order ? ` · ${transfer.order.orderNumber}` : ""}</p>{transfer.actionRequired ? <p className={`mt-3 rounded-xl p-3 text-sm ${["FAILED", "PENDING_AUTH"].includes(transfer.status) ? "bg-amber-50 text-amber-800" : "bg-paper text-ink/60"}`}>{transfer.actionRequired}</p> : null}{transfer.failureReason && transfer.status === "FAILED" ? <p className="mt-2 text-sm text-danger">Registrar message: {transfer.failureReason}</p> : null}</div>
            <div className="flex flex-wrap gap-2"><button disabled={busyId !== null || !transfer.providerTransferId} onClick={() => refresh(transfer.id)} className="btn-secondary">{busyId === transfer.id ? "Working…" : "Refresh status"}</button>{transfer.domainId ? <Link href={`/dashboard/domains/${transfer.domainId}`} className="btn-primary">Manage domain</Link> : null}</div>
          </div>

          {!["COMPLETED", "CANCELLED"].includes(transfer.status) ? <div className="mt-5 border-t border-border pt-5"><p className="eyebrow">Recovery tools</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busyId !== null} onClick={() => { setEditing(editing === transfer.id ? null : transfer.id); setAuthCode(""); }} className="btn-secondary">Change EPP code</button><button disabled={busyId !== null || !transfer.providerTransferId} onClick={() => action(transfer.id, "RESEND_EMAIL")} className="btn-secondary">Resend verification</button><button disabled={busyId !== null || !transfer.providerTransferId} onClick={() => action(transfer.id, "RESUBMIT")} className="btn-secondary">Resubmit to registry</button></div>{editing === transfer.id ? <div className="mt-4 max-w-xl rounded-xl border border-border bg-paper p-4"><label className="label">New EPP / authorization code</label><input type="password" autoComplete="off" className="input" value={authCode} onChange={(e) => setAuthCode(e.target.value)} /><p className="mt-2 text-xs text-ink/45">The replacement code is encrypted in GetSawa and, if the transfer is already submitted, updated at the registrar.</p><div className="mt-3 flex gap-2"><button disabled={!authCode.trim() || busyId !== null} onClick={() => action(transfer.id, "CHANGE_EPP")} className="btn-primary">Save new code</button><button onClick={() => { setEditing(null); setAuthCode(""); }} className="btn-secondary">Cancel</button></div></div> : null}</div> : null}
        </article>)}</div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warning" }) { return <div className={`metric-card ${tone === "warning" ? "border-amber-300" : ""}`}><p className="eyebrow">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
function statusClass(status: string) { if (status === "COMPLETED") return "badge-success"; if (["FAILED", "CANCELLED"].includes(status)) return "badge-danger"; if (["PENDING_AUTH", "AWAITING_PAYMENT"].includes(status)) return "badge-warning"; return "badge-neutral"; }
