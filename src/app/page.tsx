import { Navbar } from "@/components/Navbar";
import { DomainSearchBox } from "@/components/DomainSearchBox";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import Link from "next/link";

async function getFeaturedTlds() {
  const tlds = await prisma.tld.findMany({ where: { isActive: true }, orderBy: [{ isFeatured: "desc" }, { extension: "asc" } ], take: 8 });
  return tlds.map((t) => ({ extension: t.extension, price: computeTldPrice(t) }));
}

export default async function HomePage() {
  const tlds = await getFeaturedTlds();

  return (
    <>
      <Navbar />
      <main>
        <section className="border-b border-border bg-gradient-to-b from-brand-50 to-paper px-6 py-20 text-center">
          <p className="mb-4 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-brand-600 shadow-card">
            Everything you need to build your digital presence
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Find your perfect domain
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-ink/60">
            Domains, hosting, business email, and an AI website builder — search, buy, and manage it all from one dashboard.
          </p>
          <div className="mt-8">
            <DomainSearchBox />
          </div>

          {tlds.length > 0 && (
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-3">
              {tlds.map((t) => (
                <span key={t.extension} className="rounded-full border border-border bg-white px-3.5 py-1.5 text-sm text-ink/70">
                  <span className="font-semibold text-ink">.{t.extension}</span>{" "}
                  {formatCents(t.price.registerCents, t.price.currency)}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold">Everything your website needs</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Domains", desc: "Search, register, transfer, and manage DNS for your domain.", href: "/domains/search" },
              { title: "Hosting", desc: "Fast, reliable hosting for websites of any size.", href: "/products/HOSTING" },
              { title: "Business Email", desc: "Professional email on your own domain.", href: "/products/EMAIL" },
              { title: "AI Website Builder", desc: "Describe your business — get a live website.", href: "/dashboard/websites" },
            ].map((f) => (
              <Link key={f.title} href={f.href} className="card block p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink/60">{f.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-surface px-6 py-14 text-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
            <Link href="/domains/premium" className="btn-secondary">Browse Premium Domains</Link>
            <Link href="/domains/auctions" className="btn-secondary">Domain Auctions</Link>
            <Link href="/dashboard/affiliate" className="btn-secondary">Become an Affiliate</Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-6 py-10 text-center text-sm text-ink/50">
        © {new Date().getFullYear()} GetSawa. All rights reserved. ·{" "}
        <Link href="/blog" className="hover:underline">Blog</Link> ·{" "}
        <Link href="/legal/terms" className="hover:underline">Terms</Link> ·{" "}
        <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
      </footer>
    </>
  );
}
