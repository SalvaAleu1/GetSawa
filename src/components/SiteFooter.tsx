import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

const GROUPS = [
  {
    title: "Domains",
    links: [
      ["Search domains", "/domains/search"],
      ["Transfer a domain", "/domains/transfer"],
      ["Premium domains", "/domains/premium"],
      ["Domain auctions", "/domains/auctions"],
    ],
  },
  {
    title: "Products",
    links: [
      ["Web hosting", "/products/HOSTING"],
      ["Business email", "/products/EMAIL"],
      ["AI website builder", "/dashboard/websites"],
      ["My services", "/dashboard/services"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Blog", "/blog"],
      ["Support", "/dashboard/support"],
      ["Affiliate program", "/dashboard/affiliate"],
      ["Developer API", "/dashboard/developer"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms of service", "/legal/terms"],
      ["Privacy policy", "/legal/privacy"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink text-white">
      <div className="shell-container py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_2fr]">
          <div className="max-w-sm">
            <BrandLogo inverse />
            <p className="mt-5 text-sm leading-6 text-white/60">
              Domains and digital services in one account, with transparent pricing and a dashboard built for businesses that want fewer moving parts.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/65">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              Cloudflare migration in progress
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/35">{group.title}</p>
                <ul className="mt-4 space-y-3">
                  {group.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href} className="text-sm text-white/65 transition hover:text-white">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} GetSawa. All rights reserved.</p>
          <p>Built around server-authoritative pricing and provider-backed provisioning.</p>
        </div>
      </div>
    </footer>
  );
}
