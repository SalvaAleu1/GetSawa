"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  provisioningError: string | null;
  user: { email: string };
}

const STATUSES = ["", "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PROVISIONING", "ACTIVE", "FAILED", "CANCELLED", "REFUNDED"];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/admin/orders${status ? `?status=${status}` : ""}`).then((r) => r.json()).then((d) => setOrders(d.orders || []));
  }, [status]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <select className="input w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>)}
        </select>
      </div>

      <div className="card mt-6 divide-y divide-border">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-medium">{o.orderNumber}</p>
              <p className="text-xs text-ink/50">{o.user.email} · {new Date(o.createdAt).toDateString()}</p>
              {o.provisioningError && <p className="mt-1 text-xs text-danger">{o.provisioningError}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatCents(o.totalCents, o.currency)}</span>
              <span className="badge-neutral">{o.status.replace(/_/g, " ")}</span>
            </div>
          </div>
        ))}
        {orders.length === 0 && <p className="p-5 text-sm text-ink/60">No orders found.</p>}
      </div>
    </div>
  );
}
