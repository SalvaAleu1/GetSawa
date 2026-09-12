"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { addToCart } from "@/lib/cart-client";

interface Listing {
  id: string;
  domainName: string;
  retailPriceCents: number;
  renewalPriceCents: number;
  currency: string;
  category: string | null;
  isFeatured: boolean;
  source: "GETSAWA_INVENTORY" | "CUSTOMER_CUSTODY";
  offerEnabled: boolean;
}

export default function PremiumDomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    fetch(`/api/premium-domains/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This premium domain is no longer available.");
        setListing(data.listing);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "This premium domain is no longer available."))
      .finally(() => setLoading(false));
  }, [id]);

  function buyNow() {
    if (!listing) return;
    addToCart({ kind: "DOMAIN_REGISTRATION", domain: listing.domainName, years: 1, privacy: false, autoRenew: true });
    router.push("/checkout");
  }

  async function submitOffer(event: FormEvent) {
    event.preventDefault();
    if (!listing) return;
    const dollars = Number(offerAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) { setError("Enter a valid offer amount."); return; }
    setOfferBusy(true); setError(null); setOfferSuccess(null); setNeedsLogin(false);
    try {
      const response = await fetch(`/api/premium-domains/${listing.id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: Math.round(dollars * 100) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setNeedsLogin(true);
        throw new Error(data.error || "Could not submit this offer.");
      }
      setOfferSuccess("Your offer has been submitted. You can track its status from your marketplace dashboard.");
      setOfferAmount("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this offer."); }
    finally { setOfferBusy(false); }
  }

  return <>
    <Navbar />
    <main className="bg-paper py-10 lg:py-14">
      <div className="shell-container">
        <Link href="/domains/premium" className="text-sm font-semibold text-brand-600 hover:text-brand-700">← Premium marketplace</Link>
        {loading ? <div className="mt-6 skeleton h-96" /> : error && !listing ? <div className="empty-state mt-6"><p className="text-lg font-bold">This domain is not available.</p><p className="mt-2 text-sm text-ink/50">{error}</p><Link href="/domains/premium" className="btn-primary mt-5">Browse available domains</Link></div> : listing ? (
          <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <section className="panel p-6 lg:p-8">
                <div className="flex flex-wrap gap-2">{listing.isFeatured ? <span className="badge-warning">Featured</span> : null}<span className="badge-neutral">{listing.source === "GETSAWA_INVENTORY" ? "GetSawa inventory" : "Marketplace seller"}</span>{listing.category ? <span className="badge-neutral">{listing.category}</span> : null}</div>
                <h1 className="mt-5 break-all text-3xl font-bold tracking-tight sm:text-4xl">{listing.domainName}</h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/55">A verified premium domain ready for acquisition through GetSawa's protected marketplace checkout.</p>
                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <Info label="Purchase price" value={money(listing.retailPriceCents, listing.currency)} />
                  <Info label="Renewal estimate" value={`${money(listing.renewalPriceCents, listing.currency)} / year`} />
                </div>
              </section>

              <section className="panel p-6">
                <h2 className="section-heading">How ownership delivery works</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <Step number="1" title="Secure payment" body="The domain is reserved to your account while payment is completed." />
                  <Step number="2" title="Registrar verification" body="Ownership and registrant details are completed and verified through the registrar." />
                  <Step number="3" title="Account delivery" body="The domain is released into your GetSawa domain portfolio after verification." />
                </div>
              </section>

              <section className="panel p-6">
                <h2 className="section-heading">Renewal pricing</h2>
                <p className="mt-3 text-sm leading-6 text-ink/55">The purchase price acquires the domain. Future renewals are billed separately using the protected renewal price available at renewal time; the amount shown here is the current estimate.</p>
              </section>
            </div>

            <aside className="h-fit lg:sticky lg:top-24">
              <div className="card p-6">
                <p className="eyebrow">Buy now</p>
                <p className="mt-2 text-3xl font-bold">{money(listing.retailPriceCents, listing.currency)}</p>
                <button type="button" onClick={buyNow} className="btn-primary mt-5 w-full !py-3.5">Buy this domain</button>
                {listing.offerEnabled ? <>
                  <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs font-semibold uppercase tracking-wide text-ink/35">or make an offer</span><div className="h-px flex-1 bg-border" /></div>
                  <form onSubmit={submitOffer}>
                    <label className="label" htmlFor="premium-offer">Your offer (USD)</label>
                    <input id="premium-offer" className="input" inputMode="decimal" value={offerAmount} onChange={(event) => setOfferAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="Enter amount" required />
                    <button disabled={offerBusy} className="btn-secondary mt-3 w-full">{offerBusy ? "Submitting…" : "Submit offer"}</button>
                  </form>
                </> : null}
                {offerSuccess ? <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-3 text-xs leading-5 text-success">{offerSuccess}</div> : null}
                {error && listing ? <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 p-3 text-xs leading-5 text-danger">{error}{needsLogin ? <> <Link href="/login" className="font-bold underline">Sign in to submit an offer.</Link></> : null}</div> : null}
                <p className="mt-5 text-xs leading-5 text-ink/45">Availability is rechecked before payment. A domain is not considered sold until payment and ownership delivery are completed.</p>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
    <SiteFooter />
  </>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-border bg-paper p-4"><p className="eyebrow">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>; }
function Step({ number, title, body }: { number: string; title: string; body: string }) { return <div><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{number}</span><h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-ink/50">{body}</p></div>; }
function money(cents: number, currency: string) { return (cents / 100).toLocaleString(undefined, { style: "currency", currency }); }
