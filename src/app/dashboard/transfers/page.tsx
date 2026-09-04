"use client";

import { useEffect, useState } from "react";

interface Transfer {
  id: string;
  domainName: string;
  status: string;
  failureReason: string | null;
  providerTransferId: string | null;
  createdAt: string;
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/dashboard/transfers");
    const data = await res.json();
    setTransfers(data.transfers || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function refresh(id: string) {
    setRefreshing(id);
    await fetch(`/api/dashboard/transfers/${id}/refresh`, { method: "POST" });
    await load();
    setRefreshing(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Domain Transfers</h1>
      {loading ? (
        <p className="mt-6 text-ink/60">Loading…</p>
      ) : transfers.length === 0 ? (
        <p className="mt-6 text-ink/60">No transfers in progress.</p>
      ) : (
        <div className="card mt-6 divide-y divide-border">
          {transfers.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium">{t.domainName}</p>
                <p className="text-xs text-ink/50">
                  Started {new Date(t.createdAt).toDateString()}
                  {t.failureReason ? ` — ${t.failureReason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                {t.providerTransferId && (
                  <button onClick={() => refresh(t.id)} disabled={refreshing === t.id} className="btn-secondary">
                    {refreshing === t.id ? "Checking…" : "Refresh status"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-ink/40">
        Registry transfers are handled between registrars and can take several days, and may require approval at your
        previous registrar.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "badge-success",
    SUBMITTED: "badge-warning",
    IN_PROGRESS: "badge-warning",
    PENDING_AUTH: "badge-warning",
    AWAITING_PAYMENT: "badge-neutral",
    FAILED: "badge-danger",
    CANCELLED: "badge-neutral",
  };
  return <span className={map[status] || "badge-neutral"}>{status.replace(/_/g, " ")}</span>;
}
