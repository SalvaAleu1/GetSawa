"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

export default function AffiliateDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/dashboard/affiliate");
    const d = await res.json();
    setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleJoin() {
    setJoining(true);
    await fetch("/api/dashboard/affiliate", { method: "POST" });
    await load();
    setJoining(false);
  }

  async function handleRequestPayout() {
    const res = await fetch("/api/dashboard/affiliate/payout-request", { method: "POST" });
    const d = await res.json();
    setMessage(d.message);
    load();
  }

  if (!data) return <p className="text-ink/60">Loading…</p>;

  if (!data.enrolled) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Affiliate Program</h1>
        <div className="card mt-6 p-8 text-center">
          <p className="font-medium">Earn a commission for every customer you refer to GetSawa.</p>
          <button onClick={handleJoin} disabled={joining} className="btn-primary mt-4 inline-flex">
            {joining ? "Joining…" : "Join the affiliate program"}
          </button>
        </div>
      </div>
    );
  }

  const referralLink = typeof window !== "undefined" ? `${window.location.origin}/r/${data.referralCode}` : "";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Affiliate Program</h1>

      <div className="card mt-6 p-6">
        <p className="label">Your referral link</p>
        <div className="flex gap-2">
          <input className="input" readOnly value={referralLink} onClick={(e) => (e.target as HTMLInputElement).select()} />
          <button onClick={() => navigator.clipboard.writeText(referralLink)} className="btn-secondary whitespace-nowrap">Copy</button>
        </div>
        <p className="mt-2 text-xs text-ink/50">You earn {Number(data.commissionPercent)}% on a referred customer's first order.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="card p-5"><p className="text-2xl font-semibold">{data.clicks}</p><p className="text-sm text-ink/60">Clicks</p></div>
        <div className="card p-5"><p className="text-2xl font-semibold">{formatCents(data.totals.pendingCommissionCents)}</p><p className="text-sm text-ink/60">Pending</p></div>
        <div className="card p-5"><p className="text-2xl font-semibold">{formatCents(data.totals.approvedCommissionCents)}</p><p className="text-sm text-ink/60">Approved</p></div>
        <div className="card p-5"><p className="text-2xl font-semibold">{formatCents(data.totals.paidCommissionCents)}</p><p className="text-sm text-ink/60">Paid</p></div>
      </div>

      <button onClick={handleRequestPayout} className="btn-primary mt-6">Request payout</button>
      {message && <p className="mt-2 text-sm text-ink/60">{message}</p>}

      <div className="card mt-6 divide-y divide-border">
        {data.commissions.map((c: any) => (
          <div key={c.id} className="flex justify-between px-5 py-3 text-sm">
            <span>{new Date(c.createdAt).toDateString()}</span>
            <span>{formatCents(c.amountCents)}</span>
            <span className="badge-neutral">{c.status}</span>
          </div>
        ))}
        {data.commissions.length === 0 && <p className="p-5 text-sm text-ink/60">No commissions yet.</p>}
      </div>
    </div>
  );
}
