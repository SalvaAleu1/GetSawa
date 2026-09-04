"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/money";

interface Overview {
  totalCustomers: number;
  activeCustomers: number;
  totalDomains: number;
  domainsThisPeriod: number;
  expiringSoon: number;
  revenueCentsThisPeriod: number;
  pendingPayments: number;
  failedPayments: number;
  refunds: number;
  openTickets: number;
  activePromotions: number;
  recentOrders: { id: string; orderNumber: string; status: string; totalCents: number; currency: string; user: { email: string } }[];
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview?days=30").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-ink/60">Loading…</p>;

  const cards = [
    { label: "Total Customers", value: data.totalCustomers },
    { label: "Revenue (30d)", value: formatCents(data.revenueCentsThisPeriod) },
    { label: "Active Domains", value: data.totalDomains },
    { label: "Domains Expiring Soon", value: data.expiringSoon },
    { label: "Pending Payments", value: data.pendingPayments },
    { label: "Failed Payments (30d)", value: data.failedPayments },
    { label: "Open Support Tickets", value: data.openTickets },
    { label: "Active Promotions", value: data.activePromotions },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <p className="text-2xl font-semibold">{c.value}</p>
            <p className="mt-1 text-sm text-ink/60">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent orders</h2>
        <div className="card mt-3 divide-y divide-border">
          {data.recentOrders.map((o) => (
            <Link key={o.id} href={`/admin/orders`} className="flex items-center justify-between px-5 py-3.5 hover:bg-paper">
              <div>
                <p className="font-medium">{o.orderNumber}</p>
                <p className="text-xs text-ink/50">{o.user.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{formatCents(o.totalCents, o.currency)}</span>
                <span className="badge-neutral">{o.status.replace(/_/g, " ")}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
