"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function Navbar() {
  const [user, setUser] = useState<{ firstName: string; isAdmin: boolean } | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setUser(d.user));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl font-semibold text-ink">
          Get<span className="text-brand-500">Sawa</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-ink/70 md:flex">
          <Link href="/domains/search" className="hover:text-ink">Domains</Link>
          <Link href="/domains/premium" className="hover:text-ink">Premium</Link>
          <Link href="/domains/auctions" className="hover:text-ink">Auctions</Link>
          <Link href="/dashboard/websites" className="hover:text-ink">Websites</Link>
          <Link href="/blog" className="hover:text-ink">Blog</Link>
        </nav>
        <div className="flex items-center gap-3">
          {user === undefined ? null : user ? (
            <>
              {user.isAdmin && (
                <Link href="/admin" className="btn-secondary hidden sm:inline-flex">Admin</Link>
              )}
              <Link href="/dashboard" className="btn-primary">Dashboard</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">Sign in</Link>
              <Link href="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
