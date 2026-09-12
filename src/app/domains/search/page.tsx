"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { addToCart } from "@/lib/cart-client";

interface Result {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
  reason?: string;
  registerPriceCents?: number;
  renewPriceCents?: number;
  currency: string;
  checkoutEligible: boolean;
  requiresPremiumVerification: boolean;
  premiumQuoteMissing: boolean;
  pricingProtected: boolean;
  wholesaleUpdatedAt?: string | null;
  supportsPrivacy?: boolean;
  minYears?: number;
  maxYears?: number;
}

interface TldOption {
  extension: string;
  isFeatured: boolean;
  supportsPrivacy: boolean;
  supportsPremium: boolean;
  registerPriceCents: number;
  renewPriceCents: number;
  currency: string;
  pricingProtected: boolean;
}

type AvailabilityFilter = "all" | "available" | "unavailable";
type SortMode = "recommended" | "price" | "extension";

function money(cents: number | undefined, currency: string) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

export default function DomainSearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") || "";
  const tldParam = params.get("tlds") || "";
  const [input, setInput] = useState(q);
  const [results, setResults] = useState<Result[]>([]);
  const [tlds, setTlds] = useState<TldOption[]>([]);
  const [loading, setLoading] = useState(Boolean(q));
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");

  const selectedTlds = useMemo(
    () => new Set(tldParam.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)),
    [tldParam],
  );

  useEffect(() => {
    fetch("/api/domains/tlds")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load domain extensions.");
        return data;
      })
      .then((data) => setTlds(data.tlds || []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load domain extensions."));
  }, []);

  useEffect(() => {
    setInput(q);
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ q });
    if (tldParam) query.set("tlds", tldParam);

    fetch(`/api/domains/search?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Search failed.");
        return data;
      })
      .then((data) => {
        setNotConfigured(data.configured ? null : data.message || "Domain search is not configured.");
        setResults(data.results || []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Search failed.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [q, tldParam]);

  const visibleResults = useMemo(() => {
    let next = results.filter((result) => {
      if (availabilityFilter === "available") return result.available;
      if (availabilityFilter === "unavailable") return !result.available;
      return true;
    });
    if (sortMode === "price") {
      next = [...next].sort((a, b) => (a.registerPriceCents ?? Number.MAX_SAFE_INTEGER) - (b.registerPriceCents ?? Number.MAX_SAFE_INTEGER));
    } else if (sortMode === "extension") {
      next = [...next].sort((a, b) => a.tld.localeCompare(b.tld));
    }
    return next;
  }, [availabilityFilter, results, sortMode]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const clean = input.trim();
    if (!clean) return;
    const next = new URLSearchParams();
    next.set("q", clean);
    if (tldParam) next.set("tlds", tldParam);
    router.push(`/domains/search?${next.toString()}`);
  }

  function toggleTld(extension: string) {
    const next = new Set(selectedTlds);
    if (next.has(extension)) next.delete(extension);
    else if (next.size < 25) next.add(extension);
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (next.size > 0) query.set("tlds", [...next].join(","));
    router.push(`/domains/search${query.size ? `?${query.toString()}` : ""}`);
  }

  function handleAdd(result: Result) {
    if (!result.checkoutEligible) return;
    addToCart({
      kind: "DOMAIN_REGISTRATION",
      domain: result.domain,
      years: Math.max(1, result.minYears ?? 1),
      privacy: Boolean(result.supportsPrivacy),
      autoRenew: true,
    });
    router.push("/checkout");
  }

  const availableCount = results.filter((result) => result.available).length;

  return (
    <>
      <Navbar />
      <main className="bg-paper">
        <section className="border-b border-border bg-surface py-10 sm:py-12">
          <div className="shell-container">
            <div className="max-w-3xl">
              <p className="eyebrow">Domain discovery</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Find the right domain, with pricing you can trust.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                Availability is checked live with the registrar. Display prices are protected by GetSawa&apos;s wholesale-cost floor, and checkout refreshes supplier pricing again before payment.
              </p>
            </div>

            <form onSubmit={submitSearch} className="mt-7 flex max-w-4xl flex-col gap-3 sm:flex-row">
              <input
                className="input flex-1 !py-3.5 text-base"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="yourbrand or yourbrand.com"
                aria-label="Domain name"
              />
              <button type="submit" className="btn-primary !px-7 !py-3.5">Search domains</button>
            </form>

            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <Link href="/domains/bulk-search" className="btn-secondary">Bulk search</Link>
              <Link href="/domains/tlds" className="btn-secondary">Explore TLD pricing</Link>
              <Link href="/domains/transfer" className="btn-ghost">Transfer a domain</Link>
            </div>
          </div>
        </section>

        <section className="shell-container py-8 lg:py-10">
          <div className="grid gap-7 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="space-y-5">
              <div className="panel p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Extensions</p>
                  {selectedTlds.size > 0 ? (
                    <button type="button" onClick={() => router.push(q ? `/domains/search?q=${encodeURIComponent(q)}` : "/domains/search")} className="text-xs font-semibold text-brand-600 hover:underline">
                      Clear
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-ink/45">Choose up to 25 extensions. With none selected, GetSawa checks the first 20 active TLDs.</p>
                <div className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
                  {tlds.map((tld) => (
                    <label key={tld.extension} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-paper">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={selectedTlds.has(tld.extension)}
                          onChange={() => toggleTld(tld.extension)}
                          className="h-4 w-4 rounded border-border"
                        />
                        .{tld.extension}
                      </span>
                      <span className="text-xs text-ink/45">{money(tld.registerPriceCents, tld.currency)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="panel p-4 text-xs leading-5 text-ink/55">
                <p className="font-bold text-ink">Premium-domain safety</p>
                <p className="mt-2">If the active registrar cannot provide an authoritative premium quote before payment, GetSawa blocks instant checkout rather than risk charging an ordinary TLD price for an expensive registry-premium name.</p>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{q ? `Results for “${q}”` : "Start with a domain name"}</p>
                  <p className="mt-1 text-xs text-ink/45">
                    {q ? `${availableCount} available across ${results.length} checked extensions.` : "Search above, or use bulk search for an exact list of domains."}
                  </p>
                </div>
                <div className="flex gap-2">
                  <select className="select !w-auto" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)} aria-label="Availability filter">
                    <option value="all">All results</option>
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                  <select className="select !w-auto" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort domain results">
                    <option value="recommended">Recommended</option>
                    <option value="price">Lowest price</option>
                    <option value="extension">Extension A–Z</option>
                  </select>
                </div>
              </div>

              {loading ? <div className="mt-5 panel p-8 text-sm text-ink/55">Checking live registrar availability…</div> : null}
              {error ? <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
              {notConfigured ? <div className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-ink/70">{notConfigured}</div> : null}

              {!loading && q && visibleResults.length === 0 && !error ? (
                <div className="empty-state mt-5">
                  <p className="font-bold">No results match the current filters.</p>
                  <p className="mt-1 text-sm text-ink/50">Clear the availability filter or choose different extensions.</p>
                </div>
              ) : null}

              <ul className="mt-5 space-y-3">
                {visibleResults.map((result) => {
                  const canBuy = result.available && result.checkoutEligible && result.registerPriceCents != null;
                  return (
                    <li key={result.domain} className="card p-5">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-lg font-bold">{result.domain}</p>
                            {result.available ? <span className="badge-success">Available</span> : <span className="badge-neutral">Unavailable</span>}
                            {result.isPremium ? <span className="badge-warning">Premium</span> : null}
                            {result.pricingProtected && !result.requiresPremiumVerification ? <span className="badge-success">Margin protected</span> : null}
                          </div>

                          {!result.available ? <p className="mt-2 text-sm text-ink/50">{result.reason ? `Registrar status: ${result.reason}.` : "This domain is not currently available."}</p> : null}
                          {result.requiresPremiumVerification && result.available ? (
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-700">This TLD can contain registry-premium names and the current registrar cannot provide an authoritative exact premium quote before payment. Instant checkout is intentionally blocked.</p>
                          ) : null}
                          {result.premiumQuoteMissing && result.available ? <p className="mt-2 text-sm text-amber-700">The registrar identified a premium name but did not provide a verified premium price.</p> : null}

                          {result.available ? (
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink/50">
                              {result.renewPriceCents != null ? <span>Renewal {money(result.renewPriceCents, result.currency)}/yr</span> : null}
                              <span>Privacy {result.supportsPrivacy ? "supported" : "not listed"}</span>
                              {result.wholesaleUpdatedAt ? <span>Wholesale snapshot {new Date(result.wholesaleUpdatedAt).toLocaleDateString()}</span> : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                          {result.registerPriceCents != null ? (
                            <div className="sm:text-right">
                              <p className="text-xl font-bold">{money(result.registerPriceCents, result.currency)}</p>
                              <p className="text-xs text-ink/45">displayed first-year price</p>
                            </div>
                          ) : null}
                          <button type="button" disabled={!canBuy} onClick={() => handleAdd(result)} className="btn-primary min-w-32 disabled:cursor-not-allowed disabled:opacity-40">
                            {!result.available ? "Unavailable" : canBuy ? "Add to cart" : "Price check required"}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
