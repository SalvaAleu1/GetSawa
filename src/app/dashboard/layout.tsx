"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { section: "Overview", items: [{ href: "/dashboard", label: "Dashboard" }, { href: "/dashboard/services", label: "My Services" }] },
  { section: "Domains", items: [{ href: "/dashboard/domains", label: "My Domains" }, { href: "/domains/search", label: "Register Domain" }, { href: "/domains/transfer", label: "Transfer Domain" }, { href: "/dashboard/transfers", label: "Transfer Status" }] },
  { section: "Websites", items: [{ href: "/dashboard/websites", label: "My Websites" }] },
  { section: "Billing", items: [{ href: "/dashboard/orders", label: "Orders" }, { href: "/dashboard/invoices", label: "Invoices" }] },
  { section: "Account", items: [{ href: "/dashboard/support", label: "Support" }, { href: "/dashboard/affiliate", label: "Affiliate Program" }, { href: "/dashboard/developer", label: "Developer API" }] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  async function handleLogout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }
  return (
    <div className="min-h-screen bg-paper md:flex">
      <aside className="border-b border-border bg-surface md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-6 py-5"><Link href="/" className="font-display text-lg font-semibold">Get<span className="text-brand-500">Sawa</span></Link></div>
        <nav className="space-y-6 px-4 pb-8">{NAV.map((group) => <div key={group.section}><p className="px-2 text-xs font-semibold uppercase tracking-wide text-ink/40">{group.section}</p><div className="mt-1 space-y-0.5">{group.items.map((item) => <Link key={item.href} href={item.href} className={`block rounded-lg px-3 py-2 text-sm font-medium ${pathname === item.href ? "bg-brand-50 text-brand-600" : "text-ink/70 hover:bg-paper"}`}>{item.label}</Link>)}</div></div>)}<button onClick={handleLogout} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger/5">Sign out</button></nav>
      </aside>
      <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
