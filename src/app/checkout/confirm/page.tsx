"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { clearCart } from "@/lib/cart-client";

export default function ConfirmPage() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const [status, setStatus] = useState<"capturing" | "active" | "provisioning" | "failed">("capturing");
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    fetch("/api/checkout/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Payment could not be confirmed.");
        return data;
      })
      .then((data) => {
        setOrderNumber(data.orderNumber);
        clearCart();
        if (data.status === "ACTIVE") setStatus("active");
        else if (data.status === "PROVISIONING") setStatus("provisioning");
        else setStatus("failed");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("failed");
      });
  }, [orderId]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        {status === "capturing" && <p className="text-ink/60">Confirming your payment…</p>}

        {status === "active" && (
          <>
            <h1 className="text-2xl font-semibold text-success">Order confirmed</h1>
            <p className="mt-2 text-ink/60">Order {orderNumber} is complete and active in your dashboard.</p>
            <Link href="/dashboard" className="btn-primary mt-6 inline-flex">Go to dashboard</Link>
          </>
        )}

        {status === "provisioning" && (
          <>
            <h1 className="text-2xl font-semibold">Payment received</h1>
            <p className="mt-2 text-ink/60">
              Order {orderNumber} is paid and is being set up. Some items may need a few minutes, or manual review if a provider isn't fully configured yet — check your dashboard for details.
            </p>
            <Link href="/dashboard/orders" className="btn-primary mt-6 inline-flex">View order</Link>
          </>
        )}

        {status === "failed" && (
          <>
            <h1 className="text-2xl font-semibold text-danger">We couldn't confirm this payment</h1>
            <p className="mt-2 text-ink/60">{error || "Please try again or contact support."}</p>
            <Link href="/checkout" className="btn-secondary mt-6 inline-flex">Back to checkout</Link>
          </>
        )}
      </main>
    </>
  );
}
