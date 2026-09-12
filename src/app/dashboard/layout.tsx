"use client";

import { PortalShell, type PortalNavGroup } from "@/components/PortalShell";

const NAV: PortalNavGroup[] = [
  {
    section: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/services", label: "My Services" },
    ],
  },
  {
    section: "Domains",
    items: [
      { href: "/dashboard/domains", label: "My Domains" },
      { href: "/domains/search", label: "Register Domain" },
      { href: "/domains/transfer", label: "Transfer Domain" },
      { href: "/dashboard/transfers", label: "Transfer Status" },
      { href: "/dashboard/marketplace", label: "Domain Marketplace" },
      { href: "/dashboard/marketplace/sales", label: "Marketplace Sales" },
    ],
  },
  {
    section: "Websites",
    items: [
      { href: "/dashboard/websites", label: "My Websites" },
    ],
  },
  {
    section: "Billing",
    items: [
      { href: "/dashboard/billing", label: "Billing & Renewals" },
      { href: "/dashboard/orders", label: "Orders" },
      { href: "/dashboard/invoices", label: "Invoices" },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/dashboard/settings", label: "Account & Security" },
      { href: "/dashboard/support", label: "Support" },
      { href: "/dashboard/affiliate", label: "Affiliate Program" },
      { href: "/dashboard/developer", label: "Developer API" },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell navGroups={NAV} mode="customer">
      {children}
    </PortalShell>
  );
}
