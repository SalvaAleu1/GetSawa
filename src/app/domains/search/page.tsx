"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
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
  checkoutEligible?: boolean;
  requiresPremiumVerification?: boolean;
  premiumQuoteMissing?: boolean;
  pricingProtected?: boolean;
  wholesaleUpdatedAt?: string | null;
}

export default function DomainSearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") || "";
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setError(null);
    fetch(`/api/domains/search?q=${encodeURIComponent(q)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Search failed.");
        return data;
      })
      .then((data) => {
        if (!data.configured) {
          setNotConfigured(data.message);
          setResults(data.results || []);
        } else {
          setNotConfigured(null);
          setResults(data.results || []);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q]);

  function handleAdd(r: Result) {
    if (!r.checkoutEligible) return;
    addToCart({
      kind: "DOMAIN_REGISTRATION",
      domain: r.domain,
      years: 1,
      privacy: false,
      autoRenew: true,
    });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/45">Live domain search</p>
            <h1 className="mt-1 text-3xl font-semibold">Results for “{q}”</h1>
          </div>
          <p className="max-w-md text-sm text-ink/55">
            Availability is checked live. Final checkout refreshes registrar wholesale pricing and enforces GetSawa&apos;s minimum margin safeguards.
          </p>
        </div>

        {loading && <p className="mt-8 text-ink/60">Checking live availability…</p>}
        {error && <p className="mt-8 text-danger">{error}</p>}

        {notConfigured && (
          <div className="mt-8 card border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
            {notConfigured}
          </div>
        )}

        <ul className="mt-8 space-y-3">
          {results.map((r) => {
            const canBuy = Boolean(r.available && r.checkoutEligible && r.registerPriceCents !== undefined);
            return (
              <li key={r.domain} className="card p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-lg font-semibold">{r.domain}</p>
                      {r.isPremium && <span className="badge-warning">Premium</span>}
                      {r.pricingProtected && !r.requiresPremiumVerification && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Protected price</span>
                      )}
                    </div>

                    {!r.available && (
                      <p className="mt-1 text-sm text-muted">Not available{r.reason ? ` — ${r.reason}` : ""}</p>
                    )}
                    {r.requiresPremiumVerification && r.available && (
                      <p className="mt-2 max-w-xl text-sm text-amber-700">
                        This extension can contain registry-premium names. Instant checkout is paused until the registrar can verify the exact premium price before payment.
                      </p>
                    )}
                    {r.premiumQuoteMissing && r.available && (
                      <p className="mt-2 text-sm text-amber-700">The registrar marked this domain as premium but did not return a verified price.</p>
                    )}
                    {r.renewPriceCents !== undefined && r.available && !r.isPremium && (
                      <p className="mt-2 text-xs text-ink/45">
                        Current renewal: {(r.renewPriceCents / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}/year
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {r.registerPriceCents !== undefined && (
                      <div className="text-right">
                        <p className="font-semibold">
                          {(r.registerPriceCents / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                        </p>
                        <p className="text-xs text-ink/45">first year</p>
                      </div>
                    )}
                    <button
                      disabled={!canBuy}
                      onClick={() => handleAdd(r)}
                      className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {!r.available ? "Unavailable" : r.requiresPremiumVerification || r.premiumQuoteMissing ? "Verify price" : "Add to cart"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
