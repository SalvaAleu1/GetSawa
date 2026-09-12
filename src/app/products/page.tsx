export const dynamic = "force-dynamic";

import Link from "next/link";
import { ProductCategory } from "@prisma/client";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";

interface CategoryDefinition {
  key: ProductCategory;
  label: string;
  description: string;
}

const CATEGORIES: CategoryDefinition[] = [
  { key: "HOSTING", label: "Web Hosting", description: "Provider-backed hosting plans when provisioning is configured and verified." },
  { key: "EMAIL", label: "Business Email", description: "Professional mailbox products on your domain once the email provider is live." },
  { key: "WEBSITE", label: "Website Services", description: "Website-related products and publishing services activated by GetSawa." },
  { key: "AI", label: "AI Services", description: "AI-enabled products that are currently active in the catalog." },
  { key: "SECURITY", label: "Security", description: "Security, SSL, DNS, and protection add-ons activated for sale." },
  { key: "MARKETING", label: "Marketing", description: "Marketing products and digital growth services currently enabled." },
  { key: "ADD_ON", label: "Add-ons", description: "Optional extras that can extend eligible GetSawa services." },
];

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", category: { in: CATEGORIES.map((category) => category.key) } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { retailPriceCents: "asc" }],
    select: {
      id: true,
      category: true,
      retailPriceCents: true,
      currency: true,
    },
  });

  const byCategory = new Map<ProductCategory, typeof products>();
  for (const product of products) {
    const current = byCategory.get(product.category) ?? [];
    current.push(product);
    byCategory.set(product.category, current);
  }

  return (
    <>
      <Navbar />
      <main>
        <section className="border-b border-border bg-gradient-to-b from-brand-50 to-paper py-14 sm:py-16">
          <div className="shell-container text-center">
            <p className="eyebrow">Product catalog</p>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">Explore what GetSawa can actually sell today.</h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-ink/55 sm:text-base">
              Categories remain visible for product discovery, but checkout is only available for products that have been activated after their provider requirements are satisfied.
            </p>
          </div>
        </section>

        <section className="shell-container py-14 lg:py-16">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {CATEGORIES.map((category) => {
              const active = byCategory.get(category.key) ?? [];
              const cheapest = active.length > 0 ? active.reduce((best, product) => product.retailPriceCents < best.retailPriceCents ? product : best) : null;

              return (
                <Link key={category.key} href={`/products/${category.key}`} className="card group flex min-h-64 flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xs font-black text-brand-700" aria-hidden="true">
                      {category.label.slice(0, 2).toUpperCase()}
                    </span>
                    {active.length > 0 ? <span className="badge-success">{active.length} active</span> : <span className="badge-neutral">No active plans</span>}
                  </div>
                  <h2 className="mt-5 text-xl font-bold">{category.label}</h2>
                  <p className="mt-2 flex-1 text-sm leading-6 text-ink/55">{category.description}</p>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      {cheapest ? (
                        <>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/35">From</p>
                          <p className="mt-1 text-lg font-bold">{formatCents(cheapest.retailPriceCents, cheapest.currency)}</p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-ink/45">Browse category details</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-brand-600 group-hover:text-brand-700">Explore →</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-12 rounded-2xl border border-brand-200 bg-brand-50 p-6 sm:p-8">
            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-center">
              <div>
                <p className="eyebrow text-brand-600">Why some categories show no plans</p>
                <h2 className="mt-2 text-2xl font-bold">A category is not the same thing as a provisionable product.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                  GetSawa keeps future product categories visible, but a plan is not allowed into the active catalog until its pricing, provider and provisioning path are ready. That prevents placeholder products from accepting real customer money.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Link href="/domains/search" className="btn-primary">Search domains</Link>
                <Link href="/dashboard/support" className="btn-secondary">Ask support</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
