"use client";

import { useCallback, useEffect, useState } from "react";

interface DnsRecord {
  id: string;
  type: string;
  host: string;
  value: string;
  ttl: number;
  priority?: number | null;
}

interface HistoryEvent {
  id: string;
  action: string;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface DnssecState {
  supported: boolean;
  enabled: boolean;
  records: Array<{ keyTag: number; algorithm: number; digestType: number; digest: string }>;
  provider?: string;
  message?: string;
}

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"] as const;

export function DnsManager({ domainId }: { domainId: string }) {
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [dnssec, setDnssec] = useState<DnssecState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ type: "A", host: "@", value: "", ttl: 3600, priority: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recordsRes, historyRes, dnssecRes] = await Promise.all([
        fetch(`/api/dashboard/domains/${domainId}/dns`, { cache: "no-store" }),
        fetch(`/api/dashboard/domains/${domainId}/dns/history`, { cache: "no-store" }),
        fetch(`/api/dashboard/domains/${domainId}/dnssec`, { cache: "no-store" }),
      ]);
      const [recordsData, historyData, dnssecData] = await Promise.all([recordsRes.json(), historyRes.json(), dnssecRes.json()]);
      if (!recordsRes.ok) throw new Error(recordsData.error || "Could not load DNS records.");
      setRecords(recordsData.records || []);
      setHistory(historyRes.ok ? historyData.events || [] : []);
      setDnssec(dnssecRes.ok ? dnssecData : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load DNS settings.");
    } finally {
      setLoading(false);
    }
  }, [domainId]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEditingId(null);
    setForm({ type: "A", host: "@", value: "", ttl: 3600, priority: "" });
  }

  function startEdit(record: DnsRecord) {
    setEditingId(record.id);
    setForm({ type: record.type, host: record.host, value: record.value, ttl: record.ttl, priority: record.priority == null ? "" : String(record.priority) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useTemplate(kind: "root-a" | "www-cname" | "verification" | "mail-mx") {
    if (kind === "root-a") setForm({ type: "A", host: "@", value: "", ttl: 3600, priority: "" });
    if (kind === "www-cname") setForm({ type: "CNAME", host: "www", value: "", ttl: 3600, priority: "" });
    if (kind === "verification") setForm({ type: "TXT", host: "@", value: "", ttl: 3600, priority: "" });
    if (kind === "mail-mx") setForm({ type: "MX", host: "@", value: "", ttl: 3600, priority: "10" });
    setEditingId(null);
  }

  async function saveRecord(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const body = { type: form.type, host: form.host, value: form.value, ttl: form.ttl, priority: form.priority ? Number(form.priority) : undefined };
    try {
      const url = editingId ? `/api/dashboard/domains/${domainId}/dns/${editingId}` : `/api/dashboard/domains/${domainId}/dns`;
      const res = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not ${editingId ? "update" : "create"} the DNS record.`);
      setNotice(editingId ? "DNS record updated at the registrar." : "DNS record created at the registrar.");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "DNS change failed.");
    } finally { setBusy(false); }
  }

  async function deleteRecord(record: DnsRecord) {
    if (!window.confirm(`Delete ${record.type} ${record.host}? This can interrupt websites, email or verification.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dns/${record.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete the DNS record.");
      setNotice("DNS record deleted at the registrar.");
      if (editingId === record.id) resetForm();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "DNS deletion failed."); } finally { setBusy(false); }
  }

  async function reconcile() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dns/reconcile`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "DNS reconciliation failed.");
      setNotice(`DNS reconciled with ${data.provider}. ${data.records?.length ?? 0} record(s) loaded.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "DNS reconciliation failed."); } finally { setBusy(false); }
  }

  async function exportDns() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dns/export`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not export DNS.");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `getsawa-dns-${domainId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "DNS export failed."); } finally { setBusy(false); }
  }

  async function importDns() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const parsed = JSON.parse(importText) as { format?: string; records?: unknown[] } | unknown[];
      const payload = Array.isArray(parsed) ? { records: parsed } : parsed;
      const res = await fetch(`/api/dashboard/domains/${domainId}/dns/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "DNS import failed.");
      setNotice(`Imported ${data.created} record(s)${data.failed?.length ? `; ${data.failed.length} failed` : ""}. Existing records were not deleted.`);
      setImportText(""); setShowImport(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "DNS import failed."); } finally { setBusy(false); }
  }

  if (loading) return <div className="skeleton h-80" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="section-heading">DNS records</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/55">Changes are written to the configured registrar first, then persisted in GetSawa. Reconcile whenever you suspect the registrar was changed outside GetSawa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={reconcile} className="btn-secondary">Reconcile registrar</button>
          <button disabled={busy} onClick={exportDns} className="btn-secondary">Export JSON</button>
          <button disabled={busy} onClick={() => setShowImport((value) => !value)} className="btn-secondary">Import JSON</button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success">{notice}</div> : null}

      <section className="panel p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="eyebrow">Quick templates</p>
            <p className="mt-2 text-sm text-ink/55">Templates only prefill the editor. GetSawa never invents the destination IP, hostname, verification token or mail server.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => useTemplate("root-a")} className="btn-secondary">Root A record</button>
            <button onClick={() => useTemplate("www-cname")} className="btn-secondary">www CNAME</button>
            <button onClick={() => useTemplate("verification")} className="btn-secondary">TXT verification</button>
            <button onClick={() => useTemplate("mail-mx")} className="btn-secondary">MX mail record</button>
          </div>
        </div>
      </section>

      <form onSubmit={saveRecord} className="panel grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
        <div><label className="label">Type</label><select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
        <div><label className="label">Host</label><input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="@ or www" /></div>
        <div className="md:col-span-2"><label className="label">Value / target</label><input className="input" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === "A" ? "203.0.113.10" : form.type === "MX" ? "mail.example.com" : "Record value"} /></div>
        <div><label className="label">TTL</label><input className="input" type="number" min={300} max={86400} value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })} /></div>
        <div><label className="label">Priority</label><input className="input" type="number" min={0} max={65535} disabled={form.type !== "MX"} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} placeholder={form.type === "MX" ? "10" : "Not used"} /></div>
        <div className="md:col-span-2 xl:col-span-6 flex flex-wrap gap-2"><button disabled={busy} className="btn-primary">{editingId ? "Save DNS change" : "Add DNS record"}</button>{editingId ? <button type="button" onClick={resetForm} className="btn-secondary">Cancel edit</button> : null}</div>
      </form>

      {showImport ? (
        <section className="panel p-5">
          <h3 className="font-semibold">Import GetSawa DNS JSON</h3>
          <p className="mt-1 text-sm text-ink/50">Import is additive and limited to 100 validated records. Existing records are not deleted. Use an export backup before making large changes.</p>
          <textarea className="textarea mt-4 min-h-56 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"format":"getsawa-dns-v1","records":[{"type":"A","host":"@","value":"203.0.113.10","ttl":3600}]}' />
          <div className="mt-3 flex gap-2"><button disabled={busy || !importText.trim()} onClick={importDns} className="btn-primary">Import records</button><button onClick={() => setShowImport(false)} className="btn-secondary">Cancel</button></div>
        </section>
      ) : null}

      <div className="table-shell overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-border bg-paper text-xs uppercase tracking-[0.08em] text-ink/40"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Host</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">TTL</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-border bg-white">
            {records.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50">No DNS records are cached in GetSawa. Reconcile with the registrar before assuming the zone is empty.</td></tr> : records.map((record) => (
              <tr key={record.id}>
                <td className="px-4 py-3"><span className="rounded-md bg-brand-50 px-2 py-1 font-mono text-xs font-bold text-brand-700">{record.type}</span></td>
                <td className="px-4 py-3 font-medium">{record.host}</td>
                <td className="max-w-md break-all px-4 py-3 text-ink/60">{record.value}</td>
                <td className="px-4 py-3">{record.ttl}s</td>
                <td className="px-4 py-3">{record.priority ?? "—"}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2"><button disabled={busy} onClick={() => startEdit(record)} className="btn-secondary">Edit</button><button disabled={busy} onClick={() => deleteRecord(record)} className="btn-danger">Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">DNSSEC</p><h3 className="section-heading mt-2">Registry DS-record protection</h3></div>{dnssec ? <span className={dnssec.supported ? (dnssec.enabled ? "badge-success" : "badge-warning") : "badge-neutral"}>{dnssec.supported ? (dnssec.enabled ? "Enabled" : "Available") : "Adapter unavailable"}</span> : null}</div>
          <p className="mt-3 text-sm leading-6 text-ink/55">DNSSEC can cause the domain to stop resolving if DS records do not match the authoritative DNS zone. GetSawa only enables mutation controls when the registrar adapter exposes verified DNSSEC operations.</p>
          {dnssec?.message ? <p className="mt-4 rounded-xl bg-paper p-3 text-xs leading-5 text-ink/60">{dnssec.message}</p> : null}
          {dnssec?.enabled && dnssec.records.length > 0 ? <div className="mt-4 space-y-2">{dnssec.records.map((record, index) => <div key={`${record.keyTag}-${index}`} className="rounded-xl border border-border p-3 text-xs"><p><strong>Key tag:</strong> {record.keyTag} · <strong>Algorithm:</strong> {record.algorithm} · <strong>Digest type:</strong> {record.digestType}</p><p className="mt-1 break-all font-mono text-ink/55">{record.digest}</p></div>)}</div> : null}
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Propagation guidance</p><h3 className="section-heading mt-2">What happens after a change</h3>
          <div className="mt-4 space-y-3 text-sm leading-6 text-ink/55"><p><strong className="text-ink">TTL is a cache lifetime, not a countdown.</strong> Resolvers that already cached an old answer may keep it until that cache expires.</p><p>Lowering TTL only helps future changes after resolvers have already observed the lower TTL. It cannot instantly purge an existing cache.</p><p>Nameserver changes can take longer than ordinary record updates because authority itself changes. Keep the old DNS zone available during migration.</p></div>
        </section>
      </div>

      <section className="panel">
        <div className="border-b border-border p-5"><p className="eyebrow">Change history</p><h3 className="section-heading mt-2">Recent DNS operations</h3></div>
        <div className="divide-y divide-border">{history.length === 0 ? <p className="p-5 text-sm text-ink/50">No GetSawa DNS changes have been logged yet.</p> : history.slice(0, 15).map((event) => <div key={event.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{humanAction(event.action)}</p><p className="text-xs text-ink/45">{event.ipAddress ? `IP ${event.ipAddress}` : "IP not recorded"}</p></div><time className="text-xs text-ink/45">{new Date(event.createdAt).toLocaleString()}</time></div>)}</div>
      </section>
    </div>
  );
}

function humanAction(action: string) {
  return action.replace(/^dns\./, "").replace(/\./g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
