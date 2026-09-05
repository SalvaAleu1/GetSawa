"use client";

import Link from "next/link";
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

function statusClass(status: string) {
  if (status === "PROVISIONED") return "text-success";
  if (status === "FAILED") return "text-danger";
  return "text-amber-500";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/orders")
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to load orders");
        return r.json();
      })
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="mt-1 text-sm text-ink/60">Payments, invoices, and service fulfilment in one place.</p>
        </div>
        <Link href="/domains/search" className="btn-primary">Buy a service</Link>
      </div>

      {loading ? (
        <p className="mt-6 text-ink/60">Loading…</p>
      ) : orders.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="mt-1 text-sm text-ink/60">Your completed purchases will appear here with their fulfilment status.</p>
          <Link href="/domains/search" className="btn-primary mt-5 inline-flex">Find a domain</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{o.orderNumber}</p>
                  <p className="text-xs text-ink/50">{new Date(o.createdAt).toDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold">{formatCents(o.totalCents, o.currency)}</p>
                    <span className="badge-neutral">{o.status.replace(/_/g, " ")}</span>
                  </div>
                  <Link href={`/dashboard/orders/${o.id}`} className="btn-secondary text-sm">View details</Link>
                </div>
              </div>
              <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                {o.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink/70">{item.description}</span>
                    <span className={statusClass(item.provisioningStatus)}>{item.provisioningStatus.replace(/_/g, " ")}</span>
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
