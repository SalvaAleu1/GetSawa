"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";

interface TldRow {
  extension: string;
  isFeatured: boolean;
  supportsPrivacy: boolean;
  supportsPremium: boolean;
  minYears: number;
  maxYears: number;
  promotionEligible: boolean;
  registerPriceCents: number;
  renewPriceCents: number;
  transferPriceCents: number | null;
  currency: string;
  pricingProtected: boolean;
  wholesaleUpdatedAt: string | null;
}

function money(cents: number | null | undefined, currency: string) {
  return cents == null ? "—" : (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

export default function TldExplorerPage() {
  const [rows, setRows] = useState<TldRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/domains/tlds")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load TLD pricing.");
        return data;
      })
      .then((data) => setRows(data.tlds || []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load TLD pricing."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^\./, "");
    return rows.filter((row) => !needle || row.extension.includes(needle));
  }, [query, rows]);

  return (
    <>
      <Navbar />
      <main className="bg-paper">
        <section className="border-b border-border bg-surface py-12">
          <div className="shell-container">
            <p className="eyebrow">TLD explorer</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Registration, renewal, and transfer pricing in one place.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/60">These are current storefront prices built from GetSawa&apos;s configured rules and latest wholesale snapshot. Exact domain availability and premium status are checked separately during search and checkout.</p>
            <div className="mt-6 max-w-lg">
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter extensions, e.g. com or africa" aria-label="Filter TLDs" />
            </div>
          </div>
        </section>

        <section className="shell-container py-10">
          {loading ? <div className="panel p-8 text-sm text-ink/55">Loading active domain extensions…</div> : null}
          {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}

          {!loading && !error ? (
            <div className="table-shell overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-paper text-xs uppercase tracking-wide text-ink/45">
                  <tr>
                    <th className="px-5 py-4">Extension</th>
                    <th className="px-5 py-4">Register</th>
                    <th className="px-5 py-4">Renew</th>
                    <th className="px-5 py-4">Transfer</th>
                    <th className="px-5 py-4">Features</th>
                    <th className="px-5 py-4">Pricing state</th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((row) => (
                    <tr key={row.extension} className="bg-surface align-top">
                      <td className="px-5 py-4">
                        <p className="font-bold">.{row.extension}</p>
                        <p className="mt-1 text-xs text-ink/45">{row.minYears}–{row.maxYears} year registration term</p>
                      </td>
                      <td className="px-5 py-4 font-semibold">{money(row.registerPriceCents, row.currency)}</td>
                      <td className="px-5 py-4">{money(row.renewPriceCents, row.currency)}</td>
                      <td className="px-5 py-4">{money(row.transferPriceCents, row.currency)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {row.supportsPrivacy ? <span className="badge-success">Privacy</span> : null}
                          {row.supportsPremium ? <span className="badge-warning">Premium-capable</span> : null}
                          {row.isFeatured ? <span className="badge-neutral">Featured</span> : null}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={row.pricingProtected ? "badge-success" : "badge-warning"}>{row.pricingProtected ? "Wholesale protected" : "Needs wholesale price"}</span>
                        {row.wholesaleUpdatedAt ? <p className="mt-2 text-xs text-ink/40">Updated {new Date(row.wholesaleUpdatedAt).toLocaleDateString()}</p> : null}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/domains/search?tlds=${encodeURIComponent(row.extension)}`} className="text-sm font-bold text-brand-600 hover:underline">Search .{row.extension}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && !error && filtered.length === 0 ? <div className="empty-state"><p className="font-bold">No active TLD matches that filter.</p></div> : null}

          <div className="mt-8 panel p-5 text-sm leading-6 text-ink/60">
            <p className="font-bold text-ink">Why registration and renewal prices differ</p>
            <p className="mt-2">Registries and wholesale providers can charge different amounts for registration, renewal, transfer, restoration, and premium names. GetSawa keeps those operations separate instead of assuming the first-year price is the lifetime renewal price.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
