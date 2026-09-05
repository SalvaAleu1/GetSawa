"use client";

import { useEffect, useState } from "react";

interface Refund { id: string; amountCents: number; status: string; reason: string | null; providerRefundId: string | null; createdAt: string }
interface Payment { id: string; amountCents: number; currency: string; status: string; provider: string; providerCaptureId: string | null; createdAt: string; order: { orderNumber: string; totalCents: number; currency: string }; user: { email: string; firstName: string; lastName: string }; refunds: Refund[] }

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/payments", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setPayments(Array.isArray(data.payments) ? data.payments : []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function refund(payment: Payment) {
    const completed = payment.refunds.filter(r => r.status === "COMPLETED").reduce((sum, r) => sum + r.amountCents, 0);
    const remaining = payment.amountCents - completed;
    if (remaining <= 0) return;
    const input = window.prompt(`Refund amount in ${payment.currency} (maximum ${(remaining / 100).toFixed(2)}):`, (remaining / 100).toFixed(2));
    if (input === null) return;
    const amountCents = Math.round(Number(input) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > remaining) { setMessage("Invalid refund amount."); return; }
    const reason = window.prompt("Refund reason (optional):") || undefined;
    setBusy(payment.id); setMessage("");
    try {
      const res = await fetch(`/api/admin/payments/${payment.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents, reason }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Refund failed.");
      setMessage(`Refund completed for ${payment.order.orderNumber}.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Refund failed."); }
    finally { setBusy(null); }
  }

  return <div className="space-y-8">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-amber-600">Finance</p><h1 className="mt-1 font-display text-3xl font-semibold text-ink">Payments & refunds</h1><p className="mt-2 text-sm text-ink/60">Review payment state, reconciliation results and confirmed PayPal refunds.</p></div>
    {message && <div className="rounded-xl border border-ink/10 bg-white p-4 text-sm">{message}</div>}
    <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-ink/10 text-ink/50"><tr><th className="px-5 py-4">Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Refunded</th><th className="px-5">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-5 py-8 text-center text-ink/50">Loading…</td></tr> : payments.map(p => { const refunded = p.refunds.filter(r => r.status === "COMPLETED").reduce((s,r)=>s+r.amountCents,0); const remaining=p.amountCents-refunded; const refundable=(p.status === "PAID" || p.status === "PARTIALLY_REFUNDED") && !!p.providerCaptureId && remaining>0; return <tr key={p.id} className="border-t border-ink/5"><td className="px-5 py-4 font-medium">{p.order.orderNumber}</td><td>{p.user.firstName} {p.user.lastName}<br/><span className="text-xs text-ink/50">{p.user.email}</span></td><td>{(p.amountCents/100).toFixed(2)} {p.currency}</td><td><span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs">{p.status}</span></td><td>{(refunded/100).toFixed(2)} / {(p.amountCents/100).toFixed(2)}</td><td className="px-5">{refundable ? <button disabled={busy===p.id} onClick={()=>void refund(p)} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy===p.id?"Processing…":"Refund"}</button> : <span className="text-xs text-ink/40">No action</span>}</td></tr>; })}</tbody></table></div>
  </div>;
}
