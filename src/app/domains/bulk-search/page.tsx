"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { addToCart } from "@/lib/cart-client";

interface BulkResult {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
  registerPriceCents?: number;
  renewPriceCents?: number;
  currency: string;
  checkoutEligible: boolean;
  requiresPremiumVerification: boolean;
  pricingProtected: boolean;
  supportsPrivacy?: boolean;
}

function money(cents: number | undefined, currency: string) {
  return cents == null ? "—" : (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

export default function BulkDomainSearchPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<BulkResult[]>([]);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const domains = value.split(/[\n,\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 25);
    if (domains.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/domains/bulk-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bulk search failed.");
      setResults(data.results || []);
      setUnsupported(data.unsupported || []);
      if (!data.configured && data.message) setError(data.message);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Bulk search failed.");
    } finally {
      setLoading(false);
    }
  }

  function addDomain(result: BulkResult) {
    if (!result.checkoutEligible) return;
    addToCart({ kind: "DOMAIN_REGISTRATION", domain: result.domain, years: 1, privacy: Boolean(result.supportsPrivacy), autoRenew: true });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="bg-paper">
        <section className="border-b border-border bg-surface py-12">
          <div className="shell-container">
            <p className="eyebrow">Bulk domain search</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Check up to 25 exact domains at once.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">Enter full domains such as example.com or example.africa. GetSawa only checks active extensions and preserves the same premium-price safety rules used by normal search.</p>
          </div>
        </section>

        <section className="shell-container py-10">
          <form onSubmit={handleSubmit} className="panel p-5 sm:p-6">
            <label className="label" htmlFor="bulk-domains">Domains</label>
            <textarea id="bulk-domains" className="textarea min-h-44 font-mono text-sm" value={value} onChange={(event) => setValue(event.target.value)} placeholder={"example.com\nexample.org\nmycompany.africa"} />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink/45">Separate domains with spaces, commas, or new lines. Maximum 25 per search.</p>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? "Checking…" : "Check domains"}</button>
            </div>
          </form>

          {error ? <div className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-ink/70">{error}</div> : null}
          {unsupported.length > 0 ? (
            <div className="mt-5 panel p-4 text-sm text-ink/60">
              <p className="font-bold text-ink">Unsupported or inactive extensions</p>
              <p className="mt-1 break-words">{unsupported.join(", ")}</p>
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {results.map((result) => (
              <article key={result.domain} className="card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{result.domain}</h2>
                      {result.available ? <span className="badge-success">Available</span> : <span className="badge-neutral">Unavailable</span>}
                      {result.isPremium ? <span className="badge-warning">Premium</span> : null}
                    </div>
                    {result.available && result.requiresPremiumVerification ? <p className="mt-2 max-w-2xl text-sm text-amber-700">This TLD requires an authoritative premium verification before payment, so instant checkout is blocked.</p> : null}
                    {result.available && result.renewPriceCents != null ? <p className="mt-2 text-xs text-ink/45">Renewal {money(result.renewPriceCents, result.currency)}/year</p> : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold">{money(result.registerPriceCents, result.currency)}</p>
                      <p className="text-xs text-ink/45">first year</p>
                    </div>
                    <button type="button" onClick={() => addDomain(result)} disabled={!result.checkoutEligible} className="btn-primary disabled:cursor-not-allowed disabled:opacity-40">
                      {result.checkoutEligible ? "Add to cart" : result.available ? "Price check required" : "Unavailable"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/domains/search" className="btn-secondary">Standard search</Link>
            <Link href="/domains/tlds" className="btn-ghost">TLD pricing</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
