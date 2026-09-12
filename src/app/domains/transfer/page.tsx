"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { addToCart } from "@/lib/cart-client";

interface TransferCheck {
  domain: string;
  eligible: boolean;
  reason?: string;
  premium: boolean;
  estimatedTransferPriceCents: number | null;
  currency: string;
  priceProtected: boolean;
  requirements: string[];
}

export default function TransferDomainPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [check, setCheck] = useState<TransferCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkEligibility(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.$/, "");
    if (!clean.includes(".")) { setError("Enter a complete domain such as example.com."); return; }
    setChecking(true); setError(null); setCheck(null);
    try {
      const res = await fetch(`/api/domains/transfer-check?domain=${encodeURIComponent(clean)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not verify transfer eligibility.");
      setDomain(clean);
      setCheck(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify transfer eligibility.");
    } finally { setChecking(false); }
  }

  function continueToCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!check?.eligible || check.domain !== domain.trim().toLowerCase()) { setError("Verify this domain with the registrar before continuing."); return; }
    if (!authCode.trim()) { setError("Enter the EPP/authorization code from the current registrar."); return; }
    addToCart({ kind: "DOMAIN_TRANSFER", domain: check.domain, authCode: authCode.trim() });
    router.push("/checkout");
  }

  return (
    <>
      <Navbar />
      <main className="shell-container py-12 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">Transfer to GetSawa</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Bring an existing domain into your GetSawa account.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/55">We first ask the registrar whether the domain can currently be transferred. Checkout still refreshes pricing and eligibility before payment.</p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
            <div className="space-y-5">
              <form onSubmit={checkEligibility} className="panel p-5 sm:p-6">
                <label className="label" htmlFor="transfer-domain">Domain name</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input id="transfer-domain" className="input flex-1" required placeholder="example.com" value={domain} onChange={(e) => { setDomain(e.target.value); setCheck(null); }} />
                  <button disabled={checking} className="btn-primary shrink-0">{checking ? "Checking…" : "Check transfer"}</button>
                </div>
                {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
              </form>

              {check ? (
                <section className={`rounded-2xl border p-5 sm:p-6 ${check.eligible ? "border-success/25 bg-success/5" : "border-danger/25 bg-danger/5"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="text-lg font-bold">{check.domain}</p><p className={`mt-1 text-sm ${check.eligible ? "text-success" : "text-danger"}`}>{check.eligible ? "Registrar says this domain is eligible to enter the transfer flow." : (check.reason || "The registrar says this domain cannot currently be transferred.")}</p></div>
                    {check.eligible && check.estimatedTransferPriceCents != null ? <div className="text-left sm:text-right"><p className="font-bold">{money(check.estimatedTransferPriceCents, check.currency)}</p><p className="text-xs text-ink/45">current GetSawa estimate</p></div> : null}
                  </div>
                  {check.premium ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The registrar identified this transfer as premium. Exact protected pricing is revalidated before payment.</p> : null}
                </section>
              ) : null}

              {check?.eligible ? (
                <form onSubmit={continueToCheckout} className="panel p-5 sm:p-6">
                  <h2 className="section-heading">Authorization</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/55">Enter the EPP/auth code exactly as issued by your current registrar. These codes are case-sensitive.</p>
                  <div className="mt-4"><label className="label" htmlFor="epp-code">EPP / authorization code</label><input id="epp-code" className="input" required type="password" autoComplete="off" value={authCode} onChange={(e) => setAuthCode(e.target.value)} /></div>
                  <p className="mt-2 text-xs leading-5 text-ink/45">GetSawa encrypts the code when the paid transfer order is created. It is not displayed back through the customer or staff UI.</p>
                  <button type="submit" className="btn-primary mt-5 w-full">Continue to protected checkout</button>
                </form>
              ) : null}
            </div>

            <aside className="panel h-fit p-5 sm:p-6">
              <p className="eyebrow">Before you transfer</p>
              <h2 className="section-heading mt-2">Transfer checklist</h2>
              <ol className="mt-4 space-y-4 text-sm leading-6 text-ink/60">
                <li><strong className="text-ink">1. Unlock it.</strong> Transfer lock at the losing registrar must normally be removed.</li>
                <li><strong className="text-ink">2. Check the 60-day rules.</strong> Recently registered or recently transferred domains can be ineligible.</li>
                <li><strong className="text-ink">3. Get the EPP code.</strong> Copy it exactly from the current registrar.</li>
                <li><strong className="text-ink">4. Keep email access.</strong> The registrant/admin contact may receive an approval message.</li>
                <li><strong className="text-ink">5. Keep the domain healthy.</strong> Avoid beginning a transfer too close to expiration.</li>
              </ol>
              <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-ink/45">A transfer request can remain pending at the registry for several days. The GetSawa dashboard tracks the registrar status and required action.</p>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}
