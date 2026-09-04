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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Search results for “{q}”</h1>

        {loading && <p className="mt-6 text-ink/60">Checking live availability…</p>}
        {error && <p className="mt-6 text-danger">{error}</p>}

        {notConfigured && (
          <div className="mt-6 card border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
            {notConfigured}
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {results.map((r) => (
            <li key={r.domain} className="card flex items-center justify-between p-4">
              <div>
                <p className="font-semibold">{r.domain}</p>
                {r.isPremium && <span className="badge-warning mt-1">Premium</span>}
                {!r.available && <p className="text-sm text-muted">Not available{r.reason ? ` — ${r.reason}` : ""}</p>}
              </div>
              <div className="flex items-center gap-4">
                {r.registerPriceCents !== undefined && (
                  <span className="font-semibold">
                    {(r.registerPriceCents / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}/yr
                  </span>
                )}
                <button
                  disabled={!r.available || r.registerPriceCents === undefined}
                  onClick={() => handleAdd(r)}
                  className="btn-primary"
                >
                  {r.available ? "Add to cart" : "Unavailable"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
