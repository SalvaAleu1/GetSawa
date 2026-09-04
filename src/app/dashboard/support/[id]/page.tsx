"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Message {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export default function TicketThreadPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard/support/${id}`);
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
    await fetch(`/api/dashboard/support/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    setReply("");
    await load();
    setSubmitting(false);
  }

  if (!ticket) return <p className="text-ink/60">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
        <span className="badge-neutral">{ticket.status}</span>
      </div>

      <div className="card mt-6 divide-y divide-border">
        {ticket.messages.map((m: Message) => (
          <div key={m.id} className="px-5 py-4">
            <p className="text-xs text-ink/40">{new Date(m.createdAt).toLocaleString()}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleReply} className="mt-4 flex gap-2">
        <input className="input" placeholder="Type a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button type="submit" disabled={submitting} className="btn-primary">Send</button>
      </form>
    </div>
  );
}
