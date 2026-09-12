"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { addToCart } from "@/lib/cart-client";
import { useRouter } from "next/navigation";

interface Listing {
  id: string;
  domainName: string;
  retailPriceCents: number;
  renewalPriceCents: number;
  currency: string;
  category: string | null;
  isFeatured: boolean;
  source: "GETSAWA_INVENTORY" | "CUSTOMER_CUSTODY";
  offerEnabled: boolean;
}

export default function PremiumDomainsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      if (source) params.set("source", source);
      if (maxPrice && Number(maxPrice) > 0) params.set("maxPrice", maxPrice);
      const res = await fetch(`/api/premium-domains?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load premium domains.");
      setListings(data.listings || []);
      setCategories(data.categories || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load premium domains.");
    } finally { setLoading(false); }
  }, [query, category, source, maxPrice]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const featured = useMemo(() => listings.filter((item) => item.isFeatured).slice(0, 4), [listings]);

  function buyNow(listing: Listing) {
    addToCart({ kind: "DOMAIN_REGISTRATION", domain: listing.domainName, years: 1, privacy: false, autoRenew: true });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="bg-paper">
        <section className="border-b border-border bg-white py-14 lg:py-20">
          <div className="shell-container">
            <div className="max-w-3xl">
              <p className="eyebrow">Premium domain marketplace</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Own a stronger name for your business.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-ink/60">Browse verified domains available for direct purchase. Every listing is checked before publication and reserved to one buyer during checkout.</p>
            </div>
          </div>
        </section>

        <section className="shell-container py-10 lg:py-14">
          <div className="panel p-5 lg:p-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search premium domains" aria-label="Search premium domains" />
              <select className="input" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
                <option value="">All categories</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="input" value={source} onChange={(event) => setSource(event.target.value)} aria-label="Listing type">
                <option value="">All listings</option>
                <option value="GETSAWA_INVENTORY">GetSawa inventory</option>
                <option value="CUSTOMER_CUSTODY">Marketplace sellers</option>
              </select>
              <input className="input" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="Maximum price (USD)" aria-label="Maximum price in US dollars" />
            </div>
          </div>

          {error ? <div className="mt-6 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}

          {featured.length > 0 && !query && !category && !source && !maxPrice ? (
            <section className="mt-10">
              <div><p className="eyebrow">Featured</p><h2 className="section-heading mt-2">Standout domains</h2></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{featured.map((item) => <PremiumCard key={item.id} listing={item} onBuy={buyNow} />)}</div>
            </section>
          ) : null}

          <section className="mt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Marketplace</p><h2 className="section-heading mt-2">Available now</h2></div>{!loading ? <p className="text-sm text-ink/50">{listings.length} {listings.length === 1 ? "domain" : "domains"}</p> : null}</div>
            {loading ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton h-52" />)}</div> : listings.length === 0 ? (
              <div className="empty-state mt-5"><p className="text-lg font-bold">No domains match these filters.</p><p className="mt-2 text-sm text-ink/50">Adjust your search or price range to explore other verified listings.</p><button type="button" className="btn-secondary mt-5" onClick={() => { setQuery(""); setCategory(""); setSource(""); setMaxPrice(""); }}>Clear filters</button></div>
            ) : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{listings.map((item) => <PremiumCard key={item.id} listing={item} onBuy={buyNow} />)}</div>}
          </section>

          <section className="mt-12 grid gap-4 lg:grid-cols-3">
            <Info title="Verified listings" body="Domains are published only after GetSawa confirms that the domain is under managed registrar custody." />
            <Info title="Protected checkout" body="A domain is reserved to one buyer while payment is being completed, preventing conflicting sales." />
            <Info title="Ownership delivery" body="After payment, ownership is completed through registrar verification before the domain is released into the buyer's account." />
          </section>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function PremiumCard({ listing, onBuy }: { listing: Listing; onBuy: (listing: Listing) => void }) {
  return <article className="card flex h-full flex-col p-5">
    <div className="flex flex-wrap items-center gap-2">{listing.isFeatured ? <span className="badge-warning">Featured</span> : null}<span className="badge-neutral">{listing.source === "GETSAWA_INVENTORY" ? "GetSawa" : "Marketplace"}</span>{listing.category ? <span className="badge-neutral">{listing.category}</span> : null}</div>
    <Link href={`/domains/premium/${listing.id}`} className="mt-4 break-all text-xl font-bold hover:text-brand-600">{listing.domainName}</Link>
    <div className="mt-5"><p className="text-2xl font-bold">{money(listing.retailPriceCents, listing.currency)}</p><p className="mt-1 text-xs text-ink/45">Renewal estimate: {money(listing.renewalPriceCents, listing.currency)}/year</p></div>
    <div className="mt-auto flex gap-2 pt-6"><button type="button" className="btn-primary flex-1" onClick={() => onBuy(listing)}>Buy now</button><Link href={`/domains/premium/${listing.id}`} className="btn-secondary">Details</Link></div>
  </article>;
}

function Info({ title, body }: { title: string; body: string }) { return <div className="panel p-5"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/55">{body}</p></div>; }
function money(cents: number, currency: string) { return (cents / 100).toLocaleString(undefined, { style: "currency", currency }); }
