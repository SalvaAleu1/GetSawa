"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

const NAV_GROUPS = [
  {
    label: "Domains",
    items: [
      { href: "/domains/search", title: "Search domains", description: "Find and register your next domain." },
      { href: "/domains/transfer", title: "Transfer a domain", description: "Bring an existing domain to GetSawa." },
      { href: "/domains/premium", title: "Premium domains", description: "Browse higher-value domain inventory." },
      { href: "/domains/auctions", title: "Auctions", description: "Bid on domains listed at auction." },
    ],
  },
  {
    label: "Products",
    items: [
      { href: "/products", title: "All products", description: "See the GetSawa catalog and current availability." },
      { href: "/dashboard/websites", title: "AI website builder", description: "Generate and manage a website project." },
      { href: "/products/HOSTING", title: "Web hosting", description: "Explore currently active hosting products." },
      { href: "/products/EMAIL", title: "Business email", description: "Explore currently active mailbox products." },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/blog", title: "Blog", description: "Guides and updates from GetSawa." },
      { href: "/dashboard/support", title: "Support", description: "Open and manage support requests." },
      { href: "/dashboard/affiliate", title: "Affiliate program", description: "Track referrals and commissions." },
      { href: "/dashboard/developer", title: "Developer API", description: "Manage API access for integrations." },
    ],
  },
] as const;

export function Navbar() {
  const [user, setUser] = useState<{ firstName: string; isAdmin: boolean } | null | undefined>(undefined);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setUser(data.user ?? null))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setUser(null);
      });
    return () => controller.abort();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/90 bg-surface/95 backdrop-blur-xl">
      <div className="shell-container flex h-[72px] items-center justify-between gap-4">
        <BrandLogo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="group relative">
              <button type="button" className="nav-trigger" aria-haspopup="true">
                {group.label}
                <span aria-hidden="true" className="text-[10px] text-ink/35 transition group-hover:rotate-180">⌄</span>
              </button>
              <div className="pointer-events-none absolute left-1/2 top-full w-[360px] -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <div className="rounded-2xl border border-border bg-surface p-2 shadow-xl shadow-ink/10">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-xl px-4 py-3 transition hover:bg-paper focus:bg-paper focus:outline-none"
                    >
                      <span className="block text-sm font-bold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink/50">{item.description}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {user === undefined ? (
            <div className="h-10 w-36 animate-pulse rounded-xl bg-ink/5" aria-hidden="true" />
          ) : user ? (
            <>
              {user.isAdmin ? <Link href="/admin" className="btn-secondary">Admin</Link> : null}
              <Link href="/dashboard" className="btn-primary">Dashboard</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">Sign in</Link>
              <Link href="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="icon-button lg:hidden"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span aria-hidden="true" className="text-lg leading-none">{mobileOpen ? "×" : "☰"}</span>
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-surface lg:hidden">
          <div className="shell-container max-h-[calc(100vh-72px)] overflow-y-auto py-5">
            <nav className="space-y-6" aria-label="Mobile navigation">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="eyebrow">{group.label}</p>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-xl px-3 py-3 hover:bg-paper"
                      >
                        <span className="block text-sm font-bold text-ink">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-ink/50">{item.description}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-6 grid gap-2 border-t border-border pt-5 sm:grid-cols-2">
              {user ? (
                <>
                  {user.isAdmin ? <Link href="/admin" onClick={() => setMobileOpen(false)} className="btn-secondary">Admin</Link> : null}
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="btn-primary">Dashboard</Link>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="btn-secondary">Sign in</Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)} className="btn-primary">Get started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
