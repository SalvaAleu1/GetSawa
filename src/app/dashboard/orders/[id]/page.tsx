"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCents } from "@/lib/money";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: { id: string; description: string; quantity: number; unitPriceCents: number; discountCents: number; totalCents: number; provisioningStatus: string; provisioningNote: string | null }[];
  invoice: { invoiceNumber: string; status: string; paidAt: string | null } | null;
  payments: { id: string; provider: string; amountCents: number; currency: string; status: string; createdAt: string }[];
};

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/dashboard/orders/${params.id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data.error || "Unable to load order");
        return data.order as Order;
      })
      .then(setOrder)
      .catch((e) => setError(e instanceof Error ? e.message : "Unable to load order"));
  }, [params.id]);

  if (error) return <div><Link href="/dashboard/orders" className="text-sm text-brand-600">← Back to orders</Link><p className="mt-6 text-danger">{error}</p></div>;
  if (!order) return <p className="text-ink/60">Loading order…</p>;

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard/orders" className="text-sm text-brand-600">← Back to orders</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink/60">Placed {new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span className="badge-neutral">{order.status.replace(/_/g, " ")}</span>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Services</h2>
        <div className="mt-4 divide-y divide-border">
          {order.items.map((item) => (
            <div key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className={`mt-1 text-sm ${item.provisioningStatus === "PROVISIONED" ? "text-success" : item.provisioningStatus === "FAILED" ? "text-danger" : "text-amber-500"}`}>
                    {item.provisioningStatus.replace(/_/g, " ")}
                  </p>
                </div>
                <p className="font-medium">{formatCents(item.totalCents, order.currency)}</p>
              </div>
              {item.provisioningNote && item.provisioningStatus === "FAILED" && <p className="mt-2 text-sm text-danger/80">{item.provisioningNote}</p>}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Payment</h2>
          {order.payments.length === 0 ? <p className="mt-3 text-sm text-ink/60">No payment record is attached yet.</p> : order.payments.map((payment) => (
            <div key={payment.id} className="mt-3 flex justify-between gap-3 text-sm">
              <span className="text-ink/60">{payment.provider.toUpperCase()} · {payment.status}</span>
              <span className="font-medium">{formatCents(payment.amountCents, payment.currency)}</span>
            </div>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Invoice</h2>
          {order.invoice ? (
            <div className="mt-3 text-sm">
              <p><span className="text-ink/60">Invoice:</span> {order.invoice.invoiceNumber}</p>
              <p className="mt-1"><span className="text-ink/60">Status:</span> {order.invoice.status}</p>
              {order.invoice.paidAt && <p className="mt-1"><span className="text-ink/60">Paid:</span> {new Date(order.invoice.paidAt).toLocaleString()}</p>}
            </div>
          ) : <p className="mt-3 text-sm text-ink/60">Invoice not available yet.</p>}
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Order total</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCents(order.subtotalCents, order.currency)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>-{formatCents(order.discountCents, order.currency)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{formatCents(order.taxCents, order.currency)}</span></div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold"><span>Total</span><span>{formatCents(order.totalCents, order.currency)}</span></div>
        </div>
      </section>
    </div>
  );
}
