"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { addToCart } from "@/lib/cart-client";

export default function TransferDomainPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [authCode, setAuthCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = domain.trim().toLowerCase();
    if (!clean.includes(".") || !authCode.trim()) return;
    addToCart({ kind: "DOMAIN_TRANSFER", domain: clean, authCode: authCode.trim() });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-semibold">Transfer a domain to GetSawa</h1>
        <p className="mt-2 text-sm text-ink/60">
          You'll need the EPP/authorization code from your current registrar, and the domain must be unlocked there
          first.
        </p>

        <form onSubmit={handleSubmit} className="card mt-6 space-y-4 p-6">
          <div>
            <label className="label">Domain name</label>
            <input className="input" required placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div>
            <label className="label">EPP / authorization code</label>
            <input className="input" required type="password" value={authCode} onChange={(e) => setAuthCode(e.target.value)} />
            <p className="mt-1 text-xs text-ink/40">Stored encrypted — never shown back to anyone, including our own support tools, in plain text.</p>
          </div>
          <button type="submit" className="btn-primary w-full">Continue to checkout</button>
        </form>
      </main>
    </>
  );
}
