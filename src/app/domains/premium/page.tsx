"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { formatCents } from "@/lib/money";
import { addToCart } from "@/lib/cart-client";

interface Listing {
  id: string;
  domainName: string;
  purchasePriceCents: number;
  category: string | null;
  isFeatured: boolean;
}

export default function PremiumDomainsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/premium-domains").then((r) => r.json()).then((d) => setListings(d.listings || [])).finally(() => setLoading(false));
  }, []);

  function handleBuy(l: Listing) {
    addToCart({ kind: "DOMAIN_REGISTRATION", domain: l.domainName, years: 1, privacy: false, autoRenew: true });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Premium Domains</h1>
        <p className="mt-1 text-sm text-ink/60">Hand-picked, high-value domain names available to buy now.</p>

        {loading ? (
          <p className="mt-6 text-ink/60">Loading…</p>
        ) : listings.length === 0 ? (
          <p className="mt-6 text-ink/60">No premium domains listed right now.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <div key={l.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{l.domainName}</p>
                  {l.isFeatured && <span className="badge-warning">Featured</span>}
                </div>
                {l.category && <p className="mt-1 text-xs text-ink/50">{l.category}</p>}
                <p className="mt-3 text-xl font-semibold">{formatCents(l.purchasePriceCents)}</p>
                <button onClick={() => handleBuy(l)} className="btn-primary mt-3 w-full">Buy now</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
