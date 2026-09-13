"use client";
import { PortalShell,type PortalNavGroup } from "@/components/PortalShell";
const NAV:PortalNavGroup[]=[
{section:"Operations",items:[{href:"/admin/control-center",label:"Control Center"},{href:"/admin/messaging",label:"Messaging & Alerts"},{href:"/admin/operations",label:"Operational Signals"},{href:"/admin/customers",label:"Customers"},{href:"/admin/hosting",label:"Web Hosting"},{href:"/admin/email",label:"Business Email"},{href:"/admin/security",label:"CDN & DNS Security"},{href:"/admin/support",label:"Support"}]},
{section:"Commerce",items:[{href:"/admin/orders",label:"Orders"},{href:"/admin/billing",label:"Billing & Renewals"},{href:"/admin/payments",label:"Payments & Refunds"},{href:"/admin/pricing",label:"Pricing & Margins"},{href:"/admin/products",label:"Products"}]},
{section:"Domains",items:[{href:"/admin/tlds",label:"TLD Manager"},{href:"/admin/premium-domains",label:"Premium Domains"},{href:"/admin/auctions",label:"Auctions"}]},
{section:"Growth",items:[{href:"/admin/growth",label:"Growth & Content Center"},{href:"/admin/promotions",label:"Promotions"},{href:"/admin/coupons",label:"Coupons"},{href:"/admin/affiliates",label:"Affiliates"},{href:"/admin/blog",label:"Blog"}]},
{section:"System",items:[{href:"/admin/security-center",label:"Security & Compliance"},{href:"/admin/providers",label:"Providers"}]},
];
export default function AdminLayout({children}:{children:React.ReactNode}){return <PortalShell navGroups={NAV} mode="admin">{children}</PortalShell>}
