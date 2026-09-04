import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCents } from "@/lib/money";

export default async function DashboardHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [domainCount, expiringSoon, unpaidInvoices, recentOrders] = await Promise.all([
    prisma.domain.count({ where: { userId: user.id, status: "ACTIVE" } }),
    prisma.domain.count({ where: { userId: user.id, status: "ACTIVE", expiresAt: { lte: new Date(Date.now() + 30 * 86400000) } } }),
    prisma.invoice.count({ where: { userId: user.id, status: "UNPAID" } }),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const cards = [
    { label: "Active Domains", value: domainCount, href: "/dashboard/domains" },
    { label: "Domains Expiring Soon", value: expiringSoon, href: "/dashboard/domains" },
    { label: "Unpaid Invoices", value: unpaidInvoices, href: "/dashboard/invoices" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome back, {user.firstName}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5">
            <p className="text-3xl font-semibold">{c.value}</p>
            <p className="mt-1 text-sm text-ink/60">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent orders</h2>
        {recentOrders.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No orders yet.</p>
        ) : (
          <div className="mt-3 card divide-y divide-border">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="font-medium">{o.orderNumber}</p>
                  <p className="text-xs text-ink/50">{o.createdAt.toDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatCents(o.totalCents, o.currency)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "badge-success",
    PAYMENT_CONFIRMED: "badge-success",
    PROVISIONING: "badge-warning",
    PENDING_PAYMENT: "badge-neutral",
    FAILED: "badge-danger",
    CANCELLED: "badge-neutral",
    REFUNDED: "badge-neutral",
  };
  return <span className={map[status] || "badge-neutral"}>{status.replace(/_/g, " ")}</span>;
}
