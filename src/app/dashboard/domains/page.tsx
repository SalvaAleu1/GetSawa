"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DomainRow {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean;
  isLocked: boolean;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/domains")
      .then((r) => r.json())
      .then((d) => setDomains(d.domains || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Domains</h1>
        <Link href="/domains/search" className="btn-primary">Register a domain</Link>
      </div>

      {loading ? (
        <p className="mt-6 text-ink/60">Loading…</p>
      ) : domains.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="font-medium">Your domain portfolio is empty.</p>
          <Link href="/domains/search" className="btn-primary mt-4 inline-flex">Search for a domain</Link>
        </div>
      ) : (
        <div className="card mt-6 divide-y divide-border">
          {domains.map((d) => (
            <Link key={d.id} href={`/dashboard/domains/${d.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-paper">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-ink/50">
                  {d.expiresAt ? `Expires ${new Date(d.expiresAt).toDateString()}` : "Registration in progress"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {d.autoRenew && <span className="badge-neutral">Auto-renew</span>}
                {d.isLocked && <span className="badge-neutral">Locked</span>}
                <span className={d.status === "ACTIVE" ? "badge-success" : "badge-warning"}>{d.status.replace(/_/g, " ")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
