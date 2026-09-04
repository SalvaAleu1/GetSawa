"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/invoices").then((r) => r.json()).then((d) => setInvoices(d.invoices || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Invoices</h1>
      {loading ? (
        <p className="mt-6 text-ink/60">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="mt-6 text-ink/60">No invoices yet.</p>
      ) : (
        <div className="card mt-6 divide-y divide-border">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium">{inv.invoiceNumber}</p>
                <p className="text-xs text-ink/50">{new Date(inv.createdAt).toDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{formatCents(inv.totalCents, inv.currency)}</span>
                <span className={inv.status === "PAID" ? "badge-success" : "badge-warning"}>{inv.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
