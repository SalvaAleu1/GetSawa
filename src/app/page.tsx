export const dynamic = "force-dynamic";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { DomainSearchBox } from "@/components/DomainSearchBox";
import { formatCents } from "@/lib/money";
import { getStorefrontSnapshot, type StorefrontServiceState } from "@/lib/storefront";

const STATUS_COPY: Record<StorefrontServiceState["status"], { label: string; className: string }> = {
  available: { label: "Available", className: "badge-success" },
  limited: { label: "Available with limits", className: "badge-warning" },
  preparing: { label: "In preparation", className: "badge-neutral" },
};

function billingSuffix(cycle: string) {
  if (cycle === "MONTHLY") return "/mo";
  if (cycle === "YEARLY") return "/yr";
  return "";
}

export default async function HomePage() {
  const storefront = await getStorefrontSnapshot();

  return (
    <>
      <Navbar />
      <main>
        {storefront.announcement ? (
          <section className="border-b border-brand-200 bg-brand-50">
            <div className="shell-container flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-center sm:gap-2">
              <span className="font-bold text-brand-800">{storefront.announcement.title}</span>
              <span className="text-brand-900/65">{storefront.announcement.body}</span>
            </div>
          </section>
        ) : null}

        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-50 via-white to-paper">
          <div className="absolute inset-x-0 top-0 -z-0 mx-auto h-80 max-w-5xl rounded-full bg-brand-100/50 blur-3xl" aria-hidden="true" />
          <div className="shell-container relative z-10 py-16 text-center sm:py-20 lg:py-24">
            <div className="mx-auto max-w-4xl">
              <p className="inline-flex items-center rounded-full border border-brand-100 bg-white/90 px-4 py-2 text-xs font-bold text-brand-700 shadow-sm">
                Domains and digital services, managed together
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.08] text-ink sm:text-5xl lg:text-6xl">
                Start with a domain. Build everything around it.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink/60 sm:text-lg">
                Search domains, see transparent prices, buy through server-verified checkout, and manage your digital services from one GetSawa account.
              </p>
            </div>

            <div className="mx-auto mt-9 max-w-3xl rounded-2xl border border-border bg-white p-3 shadow-xl shadow-brand-900/5 sm:p-4">
              <DomainSearchBox />
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-ink/45">
                <span>Live availability checks</span>
                <span>Server-authoritative pricing</span>
                <span>Premium domains fail safe</span>
              </div>
            </div>

            {storefront.featuredTlds.length > 0 ? (
              <div className="mx-auto mt-8 flex max-w-4xl flex-wrap items-center justify-center gap-2.5">
                {storefront.featuredTlds.slice(0, 8).map((tld) => (
                  <Link
                    key={tld.extension}
                    href={`/domains/search?q=mybusiness&tlds=${encodeURIComponent(tld.extension)}`}
                    className="rounded-full border border-border bg-white px-3.5 py-2 text-sm text-ink/60 transition hover:border-brand-200 hover:text-brand-700"
                  >
                    <span className="font-bold text-ink">.{tld.extension}</span>{" "}
                    {formatCents(tld.registerCents, tld.currency)}
                  </Link>
                ))}
              </div>
            ) : null}
            <p className="mx-auto mt-3 max-w-2xl text-[11px] leading-5 text-ink/40">
              Displayed TLD prices are storefront estimates from the current pricing configuration. Domain checkout obtains a fresh registrar cost snapshot before payment.
            </p>
          </div>
        </section>

        {storefront.banner ? (
          <section className="border-b border-border bg-ink text-white">
            <div className="shell-container flex flex-col gap-5 py-7 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-bold">{storefront.banner.title}</p>
                {storefront.banner.subtitle ? <p className="mt-1 text-sm text-white/60">{storefront.banner.subtitle}</p> : null}
              </div>
              {storefront.banner.ctaLabel && storefront.banner.ctaUrl ? (
                <Link href={storefront.banner.ctaUrl} className="btn-amber shrink-0">
                  {storefront.banner.ctaLabel}
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="shell-container py-16 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">GetSawa services</p>
            <h2 className="mt-3 text-3xl font-bold text-ink">One account, without pretending every integration is already live.</h2>
            <p className="mt-4 text-sm leading-6 text-ink/55">
              GetSawa exposes each service according to its real provider state. Products that cannot be provisioned safely stay in preparation instead of being sold as placeholders.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {storefront.services.map((service) => {
              const state = STATUS_COPY[service.status];
              return (
                <Link key={service.key} href={service.href} className="card group flex min-h-64 flex-col p-6 transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-sm font-black text-brand-600" aria-hidden="true">
                      {service.label.slice(0, 2).toUpperCase()}
                    </span>
                    <span className={state.className}>{state.label}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-ink">{service.label}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-ink/55">{service.description}</p>
                  <span className="mt-5 text-sm font-bold text-brand-600 group-hover:text-brand-700">Explore service →</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border bg-surface py-16 lg:py-20">
          <div className="shell-container">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Domain pricing</p>
                <h2 className="mt-2 text-3xl font-bold">Popular extensions at a glance</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55">
                  Registration and renewal are shown separately so customers can see what happens after the first year instead of discovering renewal pricing later.
                </p>
              </div>
              <Link href="/domains/search" className="btn-secondary shrink-0">Search all domains</Link>
            </div>

            {storefront.featuredTlds.length > 0 ? (
              <div className="table-shell mt-8 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border bg-paper text-xs uppercase tracking-[0.1em] text-ink/40">
                    <tr>
                      <th className="px-5 py-3.5 font-bold">Extension</th>
                      <th className="px-5 py-3.5 font-bold">Registration</th>
                      <th className="px-5 py-3.5 font-bold">Renewal</th>
                      <th className="px-5 py-3.5 font-bold">Privacy</th>
                      <th className="px-5 py-3.5 font-bold"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {storefront.featuredTlds.map((tld) => (
                      <tr key={tld.extension} className="hover:bg-paper/60">
                        <td className="px-5 py-4 text-lg font-bold text-ink">.{tld.extension}</td>
                        <td className="px-5 py-4 font-semibold">{formatCents(tld.registerCents, tld.currency)}</td>
                        <td className="px-5 py-4 text-ink/60">{formatCents(tld.renewCents, tld.currency)}</td>
                        <td className="px-5 py-4 text-ink/60">{tld.supportsPrivacy ? "Supported" : "Varies"}</td>
                        <td className="px-5 py-4 text-right">
                          <Link href={`/domains/search?q=mybusiness&tlds=${encodeURIComponent(tld.extension)}`} className="font-bold text-brand-600 hover:text-brand-700">
                            Search →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state mt-8">
                <h3 className="text-base font-bold">No public TLD pricing yet</h3>
                <p className="mt-2 max-w-md text-sm text-ink/50">An administrator must activate verified TLDs before prices are shown here.</p>
              </div>
            )}
          </div>
        </section>

        {storefront.featuredProducts.length > 0 ? (
          <section className="shell-container py-16 lg:py-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Active catalog</p>
                <h2 className="mt-2 text-3xl font-bold">Products currently enabled for sale</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55">Only products marked ACTIVE by the platform are surfaced here.</p>
              </div>
              <Link href="/products" className="btn-secondary shrink-0">Browse products</Link>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {storefront.featuredProducts.map((product) => (
                <Link key={product.id} href={`/products/${product.category}`} className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <span className="badge-neutral">{product.category.replaceAll("_", " ")}</span>
                    {product.isFeatured ? <span className="badge-warning">Featured</span> : null}
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{product.name}</h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-ink/55">{product.description ?? "Available through the GetSawa product catalog."}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{formatCents(product.retailPriceCents, product.currency)}</span>
                    <span className="text-sm text-ink/45">{billingSuffix(product.billingCycle)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="bg-ink py-16 text-white lg:py-20">
          <div className="shell-container grid gap-10 lg:grid-cols-[1.1fr_1.4fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-200">Commerce safeguards</p>
              <h2 className="mt-3 text-3xl font-bold">A cheaper-looking price is useless if the business loses money fulfilling it.</h2>
              <p className="mt-4 text-sm leading-7 text-white/60">
                GetSawa now prices domain transactions from server-side data, protects minimum margin, and refuses uncertain registry-premium pricing instead of guessing.
              </p>
              <Link href="/domains/search" className="btn-amber mt-6">Search safely</Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["01", "Fresh supplier check", "Domain checkout refreshes registrar wholesale pricing rather than trusting the browser."],
                ["02", "Margin floor", "Promotions and coupons cannot quietly push protected domain lines below the configured safe floor."],
                ["03", "Quote expiry", "Stale domain quotes are stopped before payment capture and must be recalculated."],
              ].map(([number, title, description]) => (
                <div key={number} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-black text-brand-200">{number}</p>
                  <h3 className="mt-5 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="shell-container py-16 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-3">
            <Link href="/domains/transfer" className="panel group p-6 transition hover:border-brand-200 hover:shadow-card">
              <p className="eyebrow">Already own a domain?</p>
              <h3 className="mt-3 text-xl font-bold">Transfer it to GetSawa</h3>
              <p className="mt-2 text-sm leading-6 text-ink/55">Start a transfer with your authorization code and follow its status from your account.</p>
              <span className="mt-5 inline-block text-sm font-bold text-brand-600">Transfer domain →</span>
            </Link>
            <Link href="/domains/premium" className="panel group p-6 transition hover:border-brand-200 hover:shadow-card">
              <p className="eyebrow">Higher-value names</p>
              <h3 className="mt-3 text-xl font-bold">Browse premium domains</h3>
              <p className="mt-2 text-sm leading-6 text-ink/55">GetSawa keeps premium pricing separate from ordinary TLD pricing so high-cost names cannot masquerade as standard domains.</p>
              <span className="mt-5 inline-block text-sm font-bold text-brand-600">Browse premium →</span>
            </Link>
            <Link href="/domains/auctions" className="panel group p-6 transition hover:border-brand-200 hover:shadow-card">
              <p className="eyebrow">Competitive listings</p>
              <h3 className="mt-3 text-xl font-bold">Explore domain auctions</h3>
              <p className="mt-2 text-sm leading-6 text-ink/55">View live auction inventory and bidding opportunities managed through the marketplace.</p>
              <span className="mt-5 inline-block text-sm font-bold text-brand-600">View auctions →</span>
            </Link>
          </div>
        </section>

        <section className="border-t border-border bg-surface py-16">
          <div className="shell-container grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div>
              <p className="eyebrow">Your account</p>
              <h2 className="mt-3 text-3xl font-bold">Buy on the storefront. Operate from one dashboard.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/55">
                Orders, domains, transfers, billing, invoices, websites, support, affiliate tools, developer access, and account security already have dedicated dashboard areas. The remaining phases deepen those workflows instead of scattering them across separate products.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/dashboard" className="btn-primary">Open dashboard</Link>
                <Link href="/dashboard/support" className="btn-secondary">Get support</Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Domains", "Portfolio, DNS, transfers and renewals"],
                ["Billing", "Orders, invoices and renewal state"],
                ["Websites", "Generated website projects and publishing"],
                ["Account", "Security, support, affiliate and API tools"],
              ].map(([title, description]) => (
                <div key={title} className="panel-muted p-5">
                  <p className="font-bold">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-ink/50">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
