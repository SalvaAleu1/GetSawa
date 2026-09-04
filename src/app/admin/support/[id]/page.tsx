"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

export default function AdminTicketThreadPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/support/${id}`);
    const data = await res.json();
    if (res.ok) setTicket(data.ticket);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSubmitting(true);
    await fetch(`/api/admin/support/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply, isInternalNote: isNote }),
    });
    setReply("");
    await load();
    setSubmitting(false);
  }

  async function setStatus(status: string) {
    await fetch(`/api/admin/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (!ticket) return <p className="text-ink/60">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <p className="text-sm text-ink/50">{ticket.user.email}</p>
        </div>
        <select className="input w-40" value={ticket.status} onChange={(e) => setStatus(e.target.value)}>
          {["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card mt-6 divide-y divide-border">
        {ticket.messages.map((m: any) => (
          <div key={m.id} className={`px-5 py-4 ${m.isInternalNote ? "bg-amber-400/5" : ""}`}>
            <p className="text-xs text-ink/40">
              {new Date(m.createdAt).toLocaleString()} {m.isInternalNote && <span className="ml-2 font-semibold text-amber-500">Internal note</span>}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleReply} className="card mt-4 space-y-3 p-4">
        <textarea className="input" rows={3} placeholder="Reply to the customer, or add an internal note…" value={reply} onChange={(e) => setReply(e.target.value)} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isNote} onChange={(e) => setIsNote(e.target.checked)} /> Internal note (not visible to customer)
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">Send</button>
        </div>
      </form>
    </div>
  );
}
