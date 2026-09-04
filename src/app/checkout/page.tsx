"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { getCart, removeFromCart, CartItem } from "@/lib/cart-client";

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCart(getCart());
  }, []);

  function handleRemove(i: number) {
    removeFromCart(i);
    setCart(getCart());
  }

  async function handlePay() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart, couponCode: couponCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout.");
      if (data.approveUrl) {
        window.location.href = data.approveUrl;
      } else {
        throw new Error("PayPal did not return an approval link.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Checkout</h1>

        {cart.length === 0 ? (
          <p className="mt-6 text-ink/60">Your cart is empty. Search for a domain to get started.</p>
        ) : (
          <>
            <ul className="mt-6 space-y-3">
              {cart.map((item, i) => (
                <li key={i} className="card flex items-center justify-between p-4">
                  <span>
                    {item.kind === "DOMAIN_REGISTRATION" && `${item.domain} — ${item.years} yr registration`}
                    {item.kind === "DOMAIN_RENEWAL" && `Domain renewal — ${item.years} yr`}
                    {item.kind === "DOMAIN_TRANSFER" && `${item.domain} — transfer to GetSawa`}
                    {item.kind === "PRODUCT" && `${item.sku} × ${item.quantity}`}
                  </span>
                  <button onClick={() => handleRemove(i)} className="text-sm text-danger hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <label className="label">Coupon code (optional)</label>
              <input className="input" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="LAUNCH50" />
            </div>

            <p className="mt-4 text-sm text-ink/50">
              The final price — including any applicable promotions — is calculated securely on the server before you pay.
            </p>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <button onClick={handlePay} disabled={submitting} className="btn-primary mt-6 w-full !py-3.5 text-base">
              {submitting ? "Preparing checkout…" : "Continue to PayPal"}
            </button>
          </>
        )}
      </main>
    </>
  );
}
