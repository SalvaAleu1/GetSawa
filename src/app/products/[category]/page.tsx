"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { formatCents } from "@/lib/money";
import { addToCart } from "@/lib/cart-client";

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  retailPriceCents: number;
  currency: string;
  billingCycle: string;
}

const LABELS: Record<string, string> = {
  HOSTING: "Hosting",
  EMAIL: "Business Email",
  SECURITY: "Security",
  AI: "AI Services",
  WEBSITE: "Website Services",
  MARKETING: "Marketing",
  ADD_ON: "Add-ons",
};

export default function ProductCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const upperCategory = category.toUpperCase();

  useEffect(() => {
    // No public "browse active products" endpoint exists yet beyond admin;
    // reuse the admin list endpoint is not possible for anonymous visitors,
    // so this calls a lightweight public route instead.
    fetch(`/api/products?category=${upperCategory}`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, [upperCategory]);

  function handleBuy(p: Product) {
    addToCart({ kind: "PRODUCT", sku: p.sku, quantity: 1 });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold">{LABELS[upperCategory] || category}</h1>

        {loading ? (
          <p className="mt-6 text-ink/60">Loading…</p>
        ) : products.length === 0 ? (
          <div className="card mt-6 p-10 text-center">
            <p className="font-medium">Not currently available</p>
            <p className="mt-1 text-sm text-ink/60">
              There are no active {LABELS[upperCategory]?.toLowerCase() || category} products yet — check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {products.map((p) => (
              <div key={p.id} className="card p-5">
                <p className="font-semibold">{p.name}</p>
                {p.description && <p className="mt-1 text-sm text-ink/60">{p.description}</p>}
                <p className="mt-3 text-lg font-semibold">
                  {formatCents(p.retailPriceCents, p.currency)}
                  {p.billingCycle !== "ONE_TIME" && <span className="text-sm text-ink/50">/{p.billingCycle === "MONTHLY" ? "mo" : "yr"}</span>}
                </p>
                <button onClick={() => handleBuy(p)} className="btn-primary mt-3 w-full">Add to cart</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
