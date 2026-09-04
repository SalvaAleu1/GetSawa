"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface AffiliateRow {
  id: string;
  user: { email: string; firstName: string; lastName: string };
  status: string;
  commissionPercent: string;
  clicks: number;
  approvedUnpaidCents: number;
  totalPaidCents: number;
}

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [paying, setPaying] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/affiliates");
    const data = await res.json();
    setAffiliates(data.affiliates || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePayout(id: string) {
    setPaying(id);
    const res = await fetch(`/api/admin/affiliates/${id}/payout`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    await load();
    setPaying(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Affiliates</h1>

      <div className="card mt-6 divide-y divide-border">
        {affiliates.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-medium">{a.user.firstName} {a.user.lastName} <span className="ml-2 text-xs text-ink/40">{a.user.email}</span></p>
              <p className="text-xs text-ink/50">{a.clicks} clicks · {Number(a.commissionPercent)}% commission</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">Owed: <strong>{formatCents(a.approvedUnpaidCents)}</strong></span>
              <button
                onClick={() => handlePayout(a.id)}
                disabled={a.approvedUnpaidCents === 0 || paying === a.id}
                className="btn-primary"
              >
                {paying === a.id ? "Sending…" : "Send payout"}
              </button>
            </div>
          </div>
        ))}
        {affiliates.length === 0 && <p className="p-5 text-sm text-ink/60">No affiliates yet.</p>}
      </div>
    </div>
  );
}
