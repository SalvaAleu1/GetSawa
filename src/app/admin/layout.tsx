"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/billing", label: "Billing & Renewals" },
  { href: "/admin/tlds", label: "TLD Manager" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/auctions", label: "Auctions" },
  { href: "/admin/premium-domains", label: "Premium Domains" },
  { href: "/admin/blog", label: "Blog" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/affiliates", label: "Affiliates" },
  { href: "/admin/providers", label: "Providers" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  async function handleLogout(){await fetch("/api/auth/logout",{method:"POST"});router.push("/");}
  return <div className="min-h-screen bg-ink md:flex"><aside className="border-b border-white/10 bg-ink text-white md:w-64 md:border-b-0 md:border-r"><div className="px-6 py-5"><Link href="/admin" className="font-display text-lg font-semibold">GetSawa <span className="text-amber-400">Admin</span></Link></div><nav className="space-y-0.5 px-4 pb-8">{NAV.map(item=><Link key={item.href} href={item.href} className={`block rounded-lg px-3 py-2 text-sm font-medium ${pathname===item.href?"bg-white/10 text-white":"text-white/60 hover:bg-white/5 hover:text-white"}`}>{item.label}</Link>)}<button onClick={handleLogout} className="mt-4 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/50 hover:bg-white/5">Sign out</button></nav></aside><main className="flex-1 bg-paper px-6 py-8 md:px-10">{children}</main></div>;
}
