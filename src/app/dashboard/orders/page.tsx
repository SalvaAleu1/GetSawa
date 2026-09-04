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
  items: { id: string; description: string; provisioningStatus: string; provisioningNote: string | null }[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/orders").then((r) => r.json()).then((d) => setOrders(d.orders || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      {loading ? (
        <p className="mt-6 text-ink/60">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="mt-6 text-ink/60">No orders yet.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{o.orderNumber}</p>
                  <p className="text-xs text-ink/50">{new Date(o.createdAt).toDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCents(o.totalCents, o.currency)}</p>
                  <span className="badge-neutral">{o.status.replace(/_/g, " ")}</span>
                </div>
              </div>
              <ul className="mt-4 space-y-1 border-t border-border pt-3 text-sm text-ink/70">
                {o.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span>{item.description}</span>
                    <span className={item.provisioningStatus === "PROVISIONED" ? "text-success" : item.provisioningStatus === "FAILED" ? "text-danger" : "text-amber-500"}>
                      {item.provisioningStatus}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
