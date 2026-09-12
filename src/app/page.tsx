export const dynamic = "force-dynamic";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { DomainSearchBox } from "@/components/DomainSearchBox";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";

async function getFeaturedTlds() {
  const tlds = await prisma.tld.findMany({
    where: { isActive: true },
    orderBy: [{ isFeatured: "desc" }, { extension: "asc" }],
    take: 8,
  });
  return tlds.map((t) => ({ extension: t.extension, price: computeTldPrice(t) }));
}

const SERVICES = [
  {
    title: "Domains",
    desc: "Search, register, transfer, and manage DNS for your domain.",
    href: "/domains/search",
  },
  {
    title: "Hosting",
    desc: "Explore hosting products and see current provider availability.",
    href: "/products/HOSTING",
  },
  {
    title: "Business Email",
    desc: "Explore professional email products for your own domain.",
    href: "/products/EMAIL",
  },
  {
    title: "AI Website Builder",
    desc: "Create and manage generated website projects from your dashboard.",
    href: "/dashboard/websites",
  },
] as const;

export default async function HomePage() {
  const tlds = await getFeaturedTlds();

  return (
    <>
      <Navbar />
      <main>
        <section className="border-b border-border bg-gradient-to-b from-brand-50 to-paper py-20 text-center">
          <div className="shell-container">
            <p className="mb-4 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-brand-600 shadow-card">
              Everything you need to build your digital presence
            </p>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              Find your perfect domain
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-ink/60">
              Search domains, compare transparent pricing, and manage your services from one GetSawa account.
            </p>
            <div className="mt-8">
              <DomainSearchBox />
            </div>
            {tlds.length > 0 ? (
              <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-3">
                {tlds.map((t) => (
                  <span key={t.extension} className="rounded-full border border-border bg-white px-3.5 py-1.5 text-sm text-ink/70">
                    <span className="font-semibold text-ink">.{t.extension}</span>{" "}
                    {formatCents(t.price.registerCents, t.price.currency)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="shell-container py-16">
          <h2 className="text-center text-2xl font-semibold">Everything your website needs</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((service) => (
              <Link key={service.title} href={service.href} className="card block p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                <h3 className="text-lg font-semibold">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/60">{service.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-surface py-14 text-center">
          <div className="shell-container flex max-w-3xl flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
            <Link href="/domains/premium" className="btn-secondary">Browse Premium Domains</Link>
            <Link href="/domains/auctions" className="btn-secondary">Domain Auctions</Link>
            <Link href="/dashboard/affiliate" className="btn-secondary">Become an Affiliate</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
