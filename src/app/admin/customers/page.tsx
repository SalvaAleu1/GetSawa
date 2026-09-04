"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  isSuspended: boolean;
  createdAt: string;
  _count: { domains: number; orders: number };
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");

  async function load(query = "") {
    const res = await fetch(`/api/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = await res.json();
    setCustomers(data.customers || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Customers</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        className="mt-4 flex gap-2"
      >
        <input className="input max-w-xs" placeholder="Search by name, email, company…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      <div className="card mt-6 divide-y divide-border">
        {customers.map((c) => (
          <Link key={c.id} href={`/admin/customers/${c.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-paper">
            <div>
              <p className="font-medium">{c.firstName} {c.lastName} <span className="ml-2 text-xs text-ink/40">{c.email}</span></p>
              <p className="text-xs text-ink/50">{c._count.domains} domains · {c._count.orders} orders</p>
            </div>
            {c.isSuspended && <span className="badge-danger">Suspended</span>}
          </Link>
        ))}
        {customers.length === 0 && <p className="p-5 text-sm text-ink/60">No customers found.</p>}
      </div>
    </div>
  );
}
