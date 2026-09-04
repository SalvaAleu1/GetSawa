"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCents } from "@/lib/money";

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [reason, setReason] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/customers/${id}`);
    const data = await res.json();
    setCustomer(data.customer);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleSuspend() {
    if (!reason.trim()) return alert("Please provide a reason.");
    await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suspend", reason }),
    });
    load();
  }

  async function handleReactivate() {
    await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reactivate" }),
    });
    load();
  }

  if (!customer) return <p className="text-ink/60">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{customer.firstName} {customer.lastName}</h1>
          <p className="text-sm text-ink/60">{customer.email}</p>
        </div>
        {customer.isSuspended ? (
          <button onClick={handleReactivate} className="btn-primary">Reactivate account</button>
        ) : (
          <div className="flex items-center gap-2">
            <input className="input w-56" placeholder="Suspension reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button onClick={handleSuspend} className="btn-danger">Suspend</button>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-semibold">Domains</h2>
          <div className="card mt-2 divide-y divide-border">
            {customer.domains.map((d: any) => (
              <div key={d.id} className="px-4 py-2.5 text-sm">{d.name} — <span className="text-ink/50">{d.status}</span></div>
            ))}
            {customer.domains.length === 0 && <p className="p-4 text-sm text-ink/60">No domains.</p>}
          </div>
        </div>
        <div>
          <h2 className="font-semibold">Orders</h2>
          <div className="card mt-2 divide-y divide-border">
            {customer.orders.map((o: any) => (
              <div key={o.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{o.orderNumber}</span>
                <span>{formatCents(o.totalCents, o.currency)}</span>
              </div>
            ))}
            {customer.orders.length === 0 && <p className="p-4 text-sm text-ink/60">No orders.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
