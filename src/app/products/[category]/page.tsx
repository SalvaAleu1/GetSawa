"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
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
  HOSTING: "Web Hosting",
  EMAIL: "Business Email",
  SECURITY: "Security",
  AI: "AI Services",
  WEBSITE: "Website Services",
  MARKETING: "Marketing",
  ADD_ON: "Add-ons",
};

const DESCRIPTIONS: Record<string, string> = {
  HOSTING: "Hosting products only appear here after their real provisioning path has been activated.",
  EMAIL: "Business email products only appear here when they are active in the GetSawa catalog.",
  SECURITY: "Security and protection add-ons currently enabled for sale.",
  AI: "AI-enabled products that are currently active in the catalog.",
  WEBSITE: "Website-related services currently activated for customers.",
  MARKETING: "Marketing products and digital growth services currently enabled.",
  ADD_ON: "Optional extras that can extend eligible GetSawa services.",
};

function billingSuffix(cycle: string) {
  if (cycle === "MONTHLY") return "/mo";
  if (cycle === "YEARLY") return "/yr";
  return "";
}

export default function ProductCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const upperCategory = category.toUpperCase();
  const label = LABELS[upperCategory] ?? category;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/products?category=${encodeURIComponent(upperCategory)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load products.");
        return data;
      })
      .then((data) => setProducts(data.products || []))
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Could not load products.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [upperCategory]);

  function handleBuy(product: Product) {
    addToCart({ kind: "PRODUCT", sku: product.sku, quantity: 1 });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main>
        <section className="border-b border-border bg-gradient-to-b from-brand-50 to-paper py-12 sm:py-14">
          <div className="shell-container">
            <Link href="/products" className="text-sm font-bold text-brand-600 hover:text-brand-700">← All products</Link>
            <p className="eyebrow mt-7">Product category</p>
            <h1 className="mt-2 text-4xl font-bold">{label}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink/55">
              {DESCRIPTIONS[upperCategory] ?? "Products currently activated for this category."}
            </p>
          </div>
        </section>

        <section className="shell-container py-12 lg:py-16">
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading products">
              {[0, 1, 2].map((item) => <div key={item} className="skeleton h-64" />)}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
              <h2 className="font-bold text-ink">Products could not be loaded</h2>
              <p className="mt-2 text-sm text-ink/60">{error}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <span className="badge-neutral">Not for sale yet</span>
              <h2 className="mt-4 text-xl font-bold">No active {label.toLowerCase()} products</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-ink/50">
                GetSawa is not accepting payment for this category until a real product has passed its provider and activation requirements.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/products" className="btn-secondary">Browse other products</Link>
                <Link href="/domains/search" className="btn-primary">Search domains</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between gap-3">
                <p className="text-sm text-ink/50">{products.length} active {products.length === 1 ? "product" : "products"}</p>
                <span className="badge-success">Active catalog only</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <article key={product.id} className="card flex flex-col p-6">
                    <span className="badge-success w-fit">Available</span>
                    <h2 className="mt-4 text-xl font-bold">{product.name}</h2>
                    <p className="mt-2 flex-1 text-sm leading-6 text-ink/55">
                      {product.description ?? "Available through the GetSawa product catalog."}
                    </p>
                    <div className="mt-6 border-t border-border pt-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{formatCents(product.retailPriceCents, product.currency)}</span>
                        <span className="text-sm text-ink/45">{billingSuffix(product.billingCycle)}</span>
                      </div>
                      <button type="button" onClick={() => handleBuy(product)} className="btn-primary mt-4 w-full">
                        Add to cart
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
