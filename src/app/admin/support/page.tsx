"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
  user: { email: string };
}

const STATUSES = ["", "OPEN", "PENDING", "RESOLVED", "CLOSED"];

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/admin/support${status ? `?status=${status}` : ""}`).then((r) => r.json()).then((d) => setTickets(d.tickets || []));
  }, [status]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support Tickets</h1>
        <select className="input w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
      </div>

      <div className="card mt-6 divide-y divide-border">
        {tickets.map((t) => (
          <Link key={t.id} href={`/admin/support/${t.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-paper">
            <div>
              <p className="font-medium">{t.subject}</p>
              <p className="text-xs text-ink/50">{t.user.email} · updated {new Date(t.updatedAt).toDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge-neutral">{t.priority}</span>
              <span className="badge-neutral">{t.status}</span>
            </div>
          </Link>
        ))}
        {tickets.length === 0 && <p className="p-5 text-sm text-ink/60">No tickets.</p>}
      </div>
    </div>
  );
}
