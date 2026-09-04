"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
}

export default function SupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/support").then((r) => r.json()).then((d) => setTickets(d.tickets || []));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open ticket.");
      router.push(`/dashboard/support/${data.ticket.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">New ticket</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
          <div>
            <label className="label">Subject</label>
            <input className="input" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <label className="label">Category (optional)</label>
            <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="billing, domains, technical…" />
          </div>
          <div>
            <label className="label">How can we help?</label>
            <textarea className="input" rows={4} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Sending…" : "Open ticket"}</button>
        </form>
      )}

      <div className="card mt-6 divide-y divide-border">
        {tickets.map((t) => (
          <Link key={t.id} href={`/dashboard/support/${t.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-paper">
            <div>
              <p className="font-medium">{t.subject}</p>
              <p className="text-xs text-ink/50">Updated {new Date(t.updatedAt).toDateString()}</p>
            </div>
            <span className="badge-neutral">{t.status}</span>
          </Link>
        ))}
        {tickets.length === 0 && <p className="p-5 text-sm text-ink/60">No support tickets yet.</p>}
      </div>
    </div>
  );
}
