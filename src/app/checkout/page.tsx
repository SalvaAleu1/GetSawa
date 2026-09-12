"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { getCart, removeFromCart, CartItem } from "@/lib/cart-client";

interface QuoteItem {
  kind: CartItem["kind"];
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  minimumTotalCents?: number;
  pricingSource?: string;
  isPremium?: boolean;
}

interface Quote {
  items: QuoteItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  appliedCouponCode: string | null;
  quotedAt: string;
  quoteExpiresAt: string;
}

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

export default function CheckoutPage() {
  const params = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [activeCoupon, setActiveCoupon] = useState<string | undefined>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const loaded = getCart();
    setCart(loaded);
    if (loaded.length > 0) void refreshQuote(loaded);
  }, []);

  async function refreshQuote(items = cart, coupon = activeCoupon) {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    setError(null);
    setNeedsLogin(false);
    try {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, couponCode: coupon || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setNeedsLogin(true);
        throw new Error(data.error || "Could not calculate a checkout quote.");
      }
      setQuote(data);
      setActiveCoupon(data.appliedCouponCode || undefined);
    } catch (cause: unknown) {
      setQuote(null);
      setError(cause instanceof Error ? cause.message : "Could not calculate a checkout quote.");
    } finally {
      setQuoteLoading(false);
    }
  }

  function handleRemove(index: number) {
    removeFromCart(index);
    const next = getCart();
    setCart(next);
    void refreshQuote(next, activeCoupon);
  }

  async function applyCoupon() {
    const normalized = couponCode.trim().toUpperCase();
    setActiveCoupon(normalized || undefined);
    await refreshQuote(cart, normalized || undefined);
  }

  async function handlePay() {
    if (!quote || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      // create-order recomputes the entire cart again. The quote shown above is
      // informative and short-lived; it is never trusted as the payment amount.
      const response = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart, couponCode: activeCoupon }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start checkout.");
      if (!data.approveUrl) throw new Error("The payment provider did not return an approval link.");
      window.location.href = data.approveUrl;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not start checkout.");
      await refreshQuote(cart, activeCoupon);
    } finally {
      setSubmitting(false);
    }
  }

  const quoteExpired = quote ? Date.now() >= new Date(quote.quoteExpiresAt).getTime() : false;

  return (
    <>
      <Navbar />
      <main className="bg-paper py-10 lg:py-14">
        <div className="shell-container">
          <div className="mb-8 max-w-3xl">
            <p className="eyebrow">Secure checkout</p>
            <h1 className="mt-2 text-3xl font-bold">Review your order before payment.</h1>
            <p className="mt-3 text-sm leading-6 text-ink/55">Your browser stores selections only—not trusted prices. GetSawa calculates this quote on the server and calculates it again when the payment order is created.</p>
          </div>

          {params.get("cancelled") === "1" ? (
            <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-ink/70">Payment was cancelled. Your cart has been preserved so you can review it and try again.</div>
          ) : null}

          {cart.length === 0 ? (
            <div className="empty-state">
              <p className="text-lg font-bold">Your cart is empty.</p>
              <p className="mt-2 text-sm text-ink/50">Search for a domain or choose an active GetSawa product to get started.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/domains/search" className="btn-primary">Search domains</Link><Link href="/products" className="btn-secondary">Browse products</Link></div>
            </div>
          ) : (
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                {cart.map((item, index) => {
                  const priced = quote?.items[index];
                  return (
                    <article key={`${item.kind}-${index}`} className="card p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-bold">{priced?.description || (item.kind === "PRODUCT" ? item.sku : "GetSawa service")}</h2>
                            {priced?.isPremium ? <span className="badge-warning">Premium</span> : null}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-ink/45">{priced?.pricingSource ? `Pricing source: ${priced.pricingSource.replaceAll("_", " ").toLowerCase()}` : quoteLoading ? "Refreshing protected price…" : "Awaiting server quote"}</p>
                          {priced && priced.discountCents > 0 ? <p className="mt-1 text-xs font-semibold text-success">Discount {money(priced.discountCents, quote?.currency || "USD")}</p> : null}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold">{priced && quote ? money(priced.totalCents, quote.currency) : "—"}</p>
                            {priced && priced.quantity > 1 ? <p className="text-xs text-ink/45">{priced.quantity} items</p> : null}
                          </div>
                          <button type="button" onClick={() => handleRemove(index)} className="text-sm font-semibold text-danger hover:underline">Remove</button>
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div className="panel p-5">
                  <label className="label" htmlFor="coupon">Coupon code</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id="coupon" className="input" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Enter code" />
                    <button type="button" disabled={quoteLoading} onClick={applyCoupon} className="btn-secondary shrink-0">Apply</button>
                  </div>
                  {activeCoupon ? <p className="mt-2 text-xs font-semibold text-success">Applied: {activeCoupon}</p> : null}
                </div>

                <div className="panel p-5 text-sm leading-6 text-ink/55">
                  <p className="font-bold text-ink">Price protection</p>
                  <p className="mt-2">Domain wholesale costs are refreshed on the server. Promotions and coupons cannot reduce protected domain lines below the configured wholesale cost, payment-fee allowance, FX reserve, and minimum GetSawa margin.</p>
                </div>
              </div>

              <aside className="h-fit lg:sticky lg:top-24">
                <div className="card p-5">
                  <h2 className="text-lg font-bold">Order summary</h2>
                  {quoteLoading ? <div className="mt-5 space-y-3"><div className="skeleton h-5 w-full" /><div className="skeleton h-5 w-3/4" /><div className="skeleton h-10 w-full" /></div> : quote ? (
                    <div className="mt-5 space-y-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-ink/55">Subtotal</span><span>{money(quote.subtotalCents, quote.currency)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-ink/55">Discounts</span><span className={quote.discountCents > 0 ? "text-success" : ""}>−{money(quote.discountCents, quote.currency)}</span></div>
                      <div className="border-t border-border pt-4"><div className="flex items-end justify-between gap-4"><span className="font-bold">Total</span><span className="text-2xl font-bold">{money(quote.totalCents, quote.currency)}</span></div></div>
                      <p className="text-xs leading-5 text-ink/40">Quote expires {new Date(quote.quoteExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. The amount is recalculated again immediately before the PayPal order is created.</p>
                    </div>
                  ) : null}

                  {quoteExpired ? <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-ink/65">This preview quote has expired. Refresh it before continuing.</div> : null}
                  {error ? <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 p-3 text-xs text-danger">{error}{needsLogin ? <span> <Link href="/login" className="font-bold underline">Sign in to continue.</Link></span> : null}</div> : null}

                  <button type="button" onClick={quoteExpired ? () => refreshQuote() : handlePay} disabled={submitting || quoteLoading || !quote} className="btn-primary mt-5 w-full !py-3.5 text-base">
                    {quoteExpired ? "Refresh quote" : submitting ? "Preparing payment…" : "Continue to PayPal"}
                  </button>
                  <p className="mt-3 text-center text-[11px] leading-5 text-ink/40">Payment is not captured until PayPal confirms the order and GetSawa verifies the amount and currency.</p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
