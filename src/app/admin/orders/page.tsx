"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface OrderRow { id: string; orderNumber: string; status: string; totalCents: number; currency: string; createdAt: string; provisioningError: string | null; user: { email: string }; items: { id: string; provisioningStatus: string; description: string }[]; }
const STATUSES = ["", "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PROVISIONING", "ACTIVE", "FAILED", "CANCELLED", "REFUNDED"];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]); const [status, setStatus] = useState(""); const [busy, setBusy] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  async function load() { const r = await fetch(`/api/admin/orders${status ? `?status=${status}` : ""}`, { cache: "no-store" }); const d = await r.json(); setOrders(d.orders || []); }
  useEffect(() => { load().catch(() => setOrders([])); }, [status]);
  async function retry(id: string) { setBusy(id); setMessage(null); try { const r = await fetch(`/api/admin/orders/${id}/retry-provisioning`, { method: "POST" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Retry failed"); setMessage(`${d.order?.orderNumber || "Order"} provisioning retry completed.`); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Retry failed."); } finally { setBusy(null); } }

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Order Operations</h1><p className="mt-1 text-sm text-ink/60">Monitor payments and fulfilment. Failed paid items can be safely retried.</p></div><select className="input w-56" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>)}</select></div>
    {message && <div className="card mt-4 p-4 text-sm">{message}</div>}
    <div className="card mt-6 divide-y divide-border">{orders.map((o) => { const failed = o.items.some((i) => i.provisioningStatus === "FAILED"); const retryable = failed && ["PAYMENT_CONFIRMED", "PROVISIONING"].includes(o.status); return <div key={o.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{o.orderNumber}</p><p className="text-xs text-ink/50">{o.user.email} · {new Date(o.createdAt).toDateString()}</p>{o.provisioningError && <p className="mt-1 text-xs text-danger">{o.provisioningError}</p>}</div><div className="flex items-center gap-3"><span className="font-semibold">{formatCents(o.totalCents, o.currency)}</span><span className="badge-neutral">{o.status.replace(/_/g, " ")}</span>{retryable && <button onClick={() => retry(o.id)} disabled={busy === o.id} className="btn-secondary text-sm">{busy === o.id ? "Retrying…" : "Retry provisioning"}</button>}</div></div>; })}{orders.length === 0 && <p className="p-5 text-sm text-ink/60">No orders found.</p>}</div>
  </div>;
}
