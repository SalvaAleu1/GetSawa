"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addToCart } from "@/lib/cart-client";

interface LifecycleDomain {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean;
  isLocked: boolean;
  privacyEnabled: boolean;
  isPremium: boolean;
  renewalPriceCents: number;
  currency: string;
  wholesaleProtected: boolean;
  daysUntilExpiry: number | null;
  tld: {
    extension: string;
    supportsPrivacy: boolean;
    minYears: number;
    maxYears: number;
  };
}

export function DomainLifecycleManager({ domainId }: { domainId: string }) {
  const [domain, setDomain] = useState<LifecycleDomain | null>(null);
  const [years, setYears] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load lifecycle settings.");
      setDomain(data.domain);
      setYears((current) => Math.min(Math.max(current, data.domain.tld?.minYears ?? 1), data.domain.tld?.maxYears ?? 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lifecycle settings.");
    } finally { setLoading(false); }
  }, [domainId]);

  useEffect(() => { load(); }, [load]);

  const renewalEstimate = useMemo(() => domain ? domain.renewalPriceCents * years : 0, [domain, years]);

  async function mutate(path: string, body: unknown, key: string, success: string) {
    setBusy(key); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The registrar rejected this change.");
      setNotice(success);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "The registrar rejected this change."); } finally { setBusy(null); }
  }

  function renew() {
    if (!domain) return;
    addToCart({ kind: "DOMAIN_RENEWAL", domainId: domain.id, years });
    window.location.href = "/checkout";
  }

  async function requestAuthCode() {
    if (!domain) return;
    if (!window.confirm(`Request the EPP transfer authorization code for ${domain.name}? NameSilo will send it to the domain administrative contact.`)) return;
    setBusy("auth"); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/auth-code`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not request the authorization code.");
      setNotice(data.message || "Authorization-code request accepted by the registrar.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not request the authorization code."); } finally { setBusy(null); }
  }

  if (loading) return <div className="skeleton h-80" />;
  if (!domain) return <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error || "Domain lifecycle information is unavailable."}</div>;

  const canRenew = !["TRANSFERRED_AWAY", "CANCELLED", "REGISTRATION_FAILED", "PENDING_REGISTRATION"].includes(domain.status);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="eyebrow">Renewal</p><h3 className="section-heading mt-2">Extend {domain.name}</h3></div>
            <span className={domain.wholesaleProtected ? "badge-success" : "badge-warning"}>{domain.wholesaleProtected ? "Cost protected" : "Price verification required"}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink/55">The amount below is an estimate from the protected pricing engine. Checkout obtains a fresh registrar wholesale snapshot before payment.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[150px_1fr]">
            <div><label className="label">Renewal period</label><select className="select" value={years} onChange={(e) => setYears(Number(e.target.value))}>{Array.from({ length: Math.max(0, domain.tld.maxYears - domain.tld.minYears + 1) }, (_, index) => domain.tld.minYears + index).map((value) => <option key={value} value={value}>{value} year{value === 1 ? "" : "s"}</option>)}</select></div>
            <div className="rounded-xl bg-paper p-4"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/40">Current estimate</p><p className="mt-1 text-2xl font-bold">{money(renewalEstimate, domain.currency)}</p><p className="mt-1 text-xs text-ink/45">{money(domain.renewalPriceCents, domain.currency)} per configured renewal year</p></div>
          </div>
          {domain.isPremium ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This is a premium domain. Checkout will fail closed unless the registrar can verify the exact premium renewal price before payment.</p> : null}
          <button disabled={!canRenew} onClick={renew} className="btn-primary mt-5 w-full">Review renewal in checkout</button>
        </section>

        <section className="panel p-5 sm:p-6">
          <p className="eyebrow">Renewal protection</p><h3 className="section-heading mt-2">Auto-renew</h3>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><p className="font-semibold">{domain.autoRenew ? "Auto-renew is enabled" : "Auto-renew is disabled"}</p><p className="mt-1 text-xs leading-5 text-ink/50">This changes the registrar setting. Successful renewal still depends on payment and registrar availability.</p></div><button disabled={busy !== null} onClick={() => mutate("autorenew", { autoRenew: !domain.autoRenew }, "autorenew", `Auto-renew ${domain.autoRenew ? "disabled" : "enabled"}.`)} className={domain.autoRenew ? "btn-secondary" : "btn-primary"}>{busy === "autorenew" ? "Saving…" : domain.autoRenew ? "Disable" : "Enable"}</button></div>
          <p className="mt-4 text-sm text-ink/55">Expiry: <strong className="text-ink">{domain.expiresAt ? new Date(domain.expiresAt).toLocaleDateString() : "Not confirmed"}</strong>{domain.daysUntilExpiry != null ? ` · ${domain.daysUntilExpiry >= 0 ? `${domain.daysUntilExpiry} days remaining` : `${Math.abs(domain.daysUntilExpiry)} days overdue`}` : ""}</p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <p className="eyebrow">Registrant privacy</p><h3 className="section-heading mt-2">WHOIS privacy</h3>
          <p className="mt-3 text-sm leading-6 text-ink/55">Privacy availability is TLD- and registrar-dependent. GetSawa only sends this mutation when the TLD is configured as supporting privacy.</p>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><p className="font-semibold">{domain.privacyEnabled ? "Privacy enabled" : "Privacy disabled"}</p><p className="mt-1 text-xs text-ink/50">.{domain.tld.extension} · {domain.tld.supportsPrivacy ? "privacy supported in catalog" : "privacy not supported in catalog"}</p></div><button disabled={busy !== null || !domain.tld.supportsPrivacy} onClick={() => mutate("privacy", { enabled: !domain.privacyEnabled }, "privacy", `WHOIS privacy ${domain.privacyEnabled ? "disabled" : "enabled"}.`)} className={domain.privacyEnabled ? "btn-secondary" : "btn-primary"}>{busy === "privacy" ? "Saving…" : domain.privacyEnabled ? "Disable" : "Enable"}</button></div>
        </section>

        <section className="panel p-5 sm:p-6">
          <p className="eyebrow">Transfer security</p><h3 className="section-heading mt-2">Registrar lock</h3>
          <p className="mt-3 text-sm leading-6 text-ink/55">Keep domains locked unless you intentionally plan to transfer them away. Unlocking reduces transfer protection.</p>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><p className="font-semibold">{domain.isLocked ? "Domain is locked" : "Domain is unlocked"}</p><p className="mt-1 text-xs text-ink/50">{domain.isLocked ? "Outbound transfer requests are blocked by registrar lock." : "Re-lock the domain if you are not actively transferring it."}</p></div><button disabled={busy !== null} onClick={() => mutate("lock", { locked: !domain.isLocked }, "lock", `Domain ${domain.isLocked ? "unlocked" : "locked"}.`)} className={domain.isLocked ? "btn-secondary" : "btn-primary"}>{busy === "lock" ? "Saving…" : domain.isLocked ? "Unlock" : "Lock"}</button></div>
        </section>
      </div>

      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl"><p className="eyebrow text-amber-700">Transfer away</p><h3 className="section-heading mt-2">Request EPP authorization code</h3><p className="mt-3 text-sm leading-6 text-amber-900/70">Use this only when moving the domain to another registrar. The domain must be unlocked first. NameSilo sends the authorization code to the domain administrative contact; GetSawa does not display or store the outbound EPP secret.</p></div>
          <button disabled={busy !== null || domain.isLocked} onClick={requestAuthCode} className="btn-secondary shrink-0">{busy === "auth" ? "Requesting…" : domain.isLocked ? "Unlock first" : "Request EPP code"}</button>
        </div>
      </section>
    </div>
  );
}

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}
