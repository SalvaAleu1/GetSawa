"use client";

import { useCallback, useEffect, useState } from "react";

interface DnssecRecord {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: string;
}

interface DnssecState {
  supported: boolean;
  enabled: boolean;
  records: DnssecRecord[];
  provider?: string;
  message?: string;
}

const EMPTY_RECORD = { keyTag: "", algorithm: "", digestType: "", digest: "" };

export function DnssecManager({ domainId }: { domainId: string }) {
  const [state, setState] = useState<DnssecState | null>(null);
  const [form, setForm] = useState(EMPTY_RECORD);
  const [pending, setPending] = useState<DnssecRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dnssec`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read DNSSEC status.");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read DNSSEC status.");
    } finally { setLoading(false); }
  }, [domainId]);

  useEffect(() => { load(); }, [load]);

  function addPending(e: React.FormEvent) {
    e.preventDefault();
    const record = {
      keyTag: Number(form.keyTag),
      algorithm: Number(form.algorithm),
      digestType: Number(form.digestType),
      digest: form.digest.trim().toUpperCase(),
    };
    if (!Number.isInteger(record.keyTag) || record.keyTag < 0 || record.keyTag > 65535) { setError("Key tag must be an integer from 0 to 65535."); return; }
    if (!Number.isInteger(record.algorithm) || record.algorithm < 0 || record.algorithm > 255) { setError("Algorithm must be an integer from 0 to 255."); return; }
    if (!Number.isInteger(record.digestType) || record.digestType < 0 || record.digestType > 255) { setError("Digest type must be an integer from 0 to 255."); return; }
    if (!/^[0-9A-F]{8,512}$/i.test(record.digest)) { setError("Digest must be a hexadecimal DS digest."); return; }
    setPending((current) => [...current, record]);
    setForm(EMPTY_RECORD); setError(null);
  }

  async function enable() {
    if (pending.length === 0) return;
    if (!window.confirm("Enable DNSSEC with these DS records? Incorrect DS data can make the domain stop resolving until corrected.")) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dnssec`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enable", records: pending }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable DNSSEC.");
      setState(data); setPending([]); setNotice("DNSSEC DS records are now registered. Verify DNS resolution after the registry publishes the change.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not enable DNSSEC."); } finally { setBusy(false); }
  }

  async function disable() {
    if (!window.confirm("Disable DNSSEC and remove the registrar DS records? Only continue when you intentionally want to remove the chain of trust.")) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dnssec`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not disable DNSSEC.");
      setState(data); setNotice("Registrar DS records were removed. Confirm the domain continues resolving as expected.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not disable DNSSEC."); } finally { setBusy(false); }
  }

  if (loading) return <div className="skeleton h-72" />;

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="eyebrow">DNS security</p><h2 className="section-heading mt-2">DNSSEC</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-ink/55">DNSSEC publishes DS records at the registrar to connect the registry chain of trust to your authoritative DNS provider. Use only the DS values supplied by that DNS provider.</p></div>
          <span className={!state?.supported ? "badge-neutral" : state.enabled ? "badge-success" : "badge-warning"}>{!state?.supported ? "Unavailable" : state.enabled ? "Enabled" : "Disabled"}</span>
        </div>
        {state?.message ? <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink/60">{state.message}</p> : null}
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Do not guess these values.</strong> A wrong key tag, algorithm, digest type or digest can make validating resolvers treat the domain as bogus and unreachable.</div>
      </section>

      {state?.supported && state.enabled ? (
        <section className="panel">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5"><div><h3 className="font-semibold">Published DS records</h3><p className="mt-1 text-xs text-ink/45">Reported by {state.provider || "the registrar"}.</p></div><button disabled={busy} onClick={disable} className="btn-danger">{busy ? "Working…" : "Disable DNSSEC"}</button></div>
          <div className="divide-y divide-border">{state.records.map((record, index) => <div key={`${record.keyTag}-${record.digest}-${index}`} className="p-5 text-sm"><div className="grid gap-3 sm:grid-cols-3"><Field label="Key tag" value={String(record.keyTag)} /><Field label="Algorithm" value={String(record.algorithm)} /><Field label="Digest type" value={String(record.digestType)} /></div><div className="mt-4"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/40">Digest</p><p className="mt-1 break-all font-mono text-xs text-ink/65">{record.digest}</p></div></div>)}</div>
        </section>
      ) : null}

      {state?.supported && !state.enabled ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
          <form onSubmit={addPending} className="panel p-5 sm:p-6">
            <h3 className="font-semibold">Add DS record</h3><p className="mt-1 text-sm text-ink/50">Copy each value exactly from the authoritative DNS provider.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3"><div><label className="label">Key tag</label><input className="input" inputMode="numeric" required value={form.keyTag} onChange={(e) => setForm({ ...form, keyTag: e.target.value })} /></div><div><label className="label">Algorithm</label><input className="input" inputMode="numeric" required value={form.algorithm} onChange={(e) => setForm({ ...form, algorithm: e.target.value })} /></div><div><label className="label">Digest type</label><input className="input" inputMode="numeric" required value={form.digestType} onChange={(e) => setForm({ ...form, digestType: e.target.value })} /></div></div>
            <div className="mt-4"><label className="label">Digest</label><textarea className="textarea min-h-28 font-mono text-xs" required value={form.digest} onChange={(e) => setForm({ ...form, digest: e.target.value })} /></div>
            <button className="btn-secondary mt-4">Add to pending set</button>
          </form>

          <section className="panel p-5 sm:p-6"><h3 className="font-semibold">Pending DS records</h3>{pending.length === 0 ? <p className="mt-4 text-sm text-ink/50">No DS records entered yet.</p> : <div className="mt-4 space-y-3">{pending.map((record, index) => <div key={`${record.keyTag}-${index}`} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold">Key {record.keyTag} · Alg {record.algorithm} · Digest {record.digestType}</p><button onClick={() => setPending((current) => current.filter((_, i) => i !== index))} className="text-xs font-semibold text-danger">Remove</button></div><p className="mt-2 break-all font-mono text-[11px] text-ink/50">{record.digest}</p></div>)}</div>}<button disabled={busy || pending.length === 0} onClick={enable} className="btn-primary mt-5 w-full">{busy ? "Enabling…" : "Enable DNSSEC"}</button></section>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/40">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
