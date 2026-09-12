"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export interface PortalNavItem {
  href: string;
  label: string;
  badge?: string;
}

export interface PortalNavGroup {
  section: string;
  items: PortalNavItem[];
}

interface PortalShellProps {
  children: React.ReactNode;
  navGroups: PortalNavGroup[];
  mode?: "customer" | "admin";
}

function matchesPath(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalShell({ children, navGroups, mode = "customer" }: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = mode === "admin";

  const currentLabel = useMemo(() => {
    for (const group of navGroups) {
      const exact = group.items.find((item) => pathname === item.href);
      if (exact) return exact.label;
    }
    for (const group of navGroups) {
      const nested = group.items.find((item) => matchesPath(pathname, item.href));
      if (nested) return nested.label;
    }
    return isAdmin ? "Admin" : "Dashboard";
  }, [isAdmin, navGroups, pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const sidebar = (
    <aside
      className={`flex h-full w-[286px] flex-col border-r ${
        isAdmin ? "border-white/10 bg-ink text-white" : "border-border bg-surface text-ink"
      }`}
    >
      <div className={`flex h-[72px] items-center border-b px-5 ${isAdmin ? "border-white/10" : "border-border"}`}>
        <BrandLogo inverse={isAdmin} suffix={isAdmin ? "Admin" : undefined} />
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-4 py-6" aria-label={isAdmin ? "Admin navigation" : "Account navigation"}>
        {navGroups.map((group) => (
          <div key={group.section}>
            <p className={`px-3 text-[10px] font-bold uppercase tracking-[0.16em] ${isAdmin ? "text-white/35" : "text-ink/35"}`}>
              {group.section}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const active = matchesPath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? isAdmin
                          ? "bg-white/10 text-white shadow-sm"
                          : "bg-brand-50 text-brand-700"
                        : isAdmin
                          ? "text-white/60 hover:bg-white/5 hover:text-white"
                          : "text-ink/60 hover:bg-paper hover:text-ink"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${isAdmin ? "bg-white/10 text-white/60" : "bg-ink/5 text-ink/55"}`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t p-4 ${isAdmin ? "border-white/10" : "border-border"}`}>
        <Link
          href="/"
          className={`mb-1 block rounded-xl px-3 py-2.5 text-sm font-semibold ${isAdmin ? "text-white/55 hover:bg-white/5 hover:text-white" : "text-ink/60 hover:bg-paper hover:text-ink"}`}
        >
          Visit storefront
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
            isAdmin ? "text-white/45 hover:bg-danger/10 hover:text-red-200" : "text-danger hover:bg-danger/5"
          }`}
        >
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[286px] shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="lg:pl-[286px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="icon-button lg:hidden"
              aria-label="Open navigation"
            >
              <span aria-hidden="true" className="text-lg leading-none">☰</span>
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{currentLabel}</p>
              <p className="hidden text-xs text-ink/45 sm:block">{isAdmin ? "GetSawa operations" : "Manage your GetSawa account"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/domains/search" className="btn-secondary hidden sm:inline-flex">
              Find a domain
            </Link>
            <Link href={isAdmin ? "/dashboard" : "/dashboard/settings"} className="icon-button" aria-label={isAdmin ? "Open customer dashboard" : "Account settings"}>
              <span aria-hidden="true" className="text-xs font-black">{isAdmin ? "CU" : "ME"}</span>
            </Link>
          </div>
        </header>

        <main className="px-4 py-6 md:px-7 md:py-8 xl:px-10">{children}</main>
      </div>
    </div>
  );
}
