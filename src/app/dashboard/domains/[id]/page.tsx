"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface DnsRecord {
  id: string;
  type: string;
  host: string;
  value: string;
  ttl: number;
  priority?: number | null;
}

interface DomainDetail {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  registeredAt: string | null;
  autoRenew: boolean;
  isLocked: boolean;
  nameservers: string[];
}

type Tab = "overview" | "dns" | "nameservers";

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDomain = useCallback(async () => {
    const res = await fetch("/api/dashboard/domains");
    const data = await res.json();
    const found = (data.domains || []).find((d: any) => d.id === id);
    setDomain(found || null);
  }, [id]);

  const loadRecords = useCallback(async () => {
    const res = await fetch(`/api/dashboard/domains/${id}/dns`);
    if (res.ok) {
      const data = await res.json();
      setRecords(data.records || []);
    }
  }, [id]);

  useEffect(() => {
    loadDomain();
  }, [loadDomain]);

  useEffect(() => {
    if (tab === "dns") loadRecords();
  }, [tab, loadRecords]);

  async function toggleLock() {
    if (!domain) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !domain.isLocked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDomain(data.domain);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoRenew() {
    if (!domain) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${id}/autorenew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRenew: !domain.autoRenew }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDomain(data.domain);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!domain) return <p className="text-ink/60">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold">{domain.name}</h1>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex gap-1 border-b border-border">
        {(["overview", "dns", "nameservers"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize ${
              tab === t ? "border-brand-500 text-brand-600" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t === "dns" ? "DNS" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="mt-6 card divide-y divide-border">
          <Row label="Status" value={domain.status.replace(/_/g, " ")} />
          <Row label="Registered" value={domain.registeredAt ? new Date(domain.registeredAt).toDateString() : "—"} />
          <Row label="Expires" value={domain.expiresAt ? new Date(domain.expiresAt).toDateString() : "—"} />
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-ink/60">Auto-renew</span>
            <button onClick={toggleAutoRenew} disabled={busy} className={domain.autoRenew ? "btn-secondary" : "btn-primary"}>
              {domain.autoRenew ? "Disable" : "Enable"}
            </button>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-ink/60">Domain lock</span>
            <button onClick={toggleLock} disabled={busy} className={domain.isLocked ? "btn-secondary" : "btn-primary"}>
              {domain.isLocked ? "Unlock" : "Lock"}
            </button>
          </div>
        </div>
      )}

      {tab === "dns" && <DnsTab domainId={id} records={records} onChange={loadRecords} />}

      {tab === "nameservers" && <NameserversTab domainId={id} current={domain.nameservers} onChange={loadDomain} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm text-ink/60">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DnsTab({ domainId, records, onChange }: { domainId: string; records: DnsRecord[]; onChange: () => void }) {
  const [form, setForm] = useState({ type: "A", host: "@", value: "", ttl: 3600 });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/domains/${domainId}/dns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the DNS record.");
      setForm({ type: "A", host: "@", value: "", ttl: 3600 });
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(recordId: string) {
    await fetch(`/api/dashboard/domains/${domainId}/dns/${recordId}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="mt-6">
      <div className="card divide-y divide-border">
        {records.length === 0 && <p className="p-5 text-sm text-ink/60">No DNS records yet.</p>}
        {records.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
            <div className="flex gap-4">
              <span className="w-16 font-mono text-xs text-brand-600">{r.type}</span>
              <span className="w-24 truncate">{r.host}</span>
              <span className="truncate text-ink/60">{r.value}</span>
            </div>
            <button onClick={() => handleDelete(r.id)} className="text-danger hover:underline">Delete</button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="card mt-4 grid grid-cols-2 gap-3 p-5 sm:grid-cols-5">
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="input" placeholder="Host (@ for root)" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
        <input className="input sm:col-span-2" placeholder="Value" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        <button type="submit" disabled={submitting} className="btn-primary">Add record</button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function NameserversTab({ domainId, current, onChange }: { domainId: string; current: string[]; onChange: () => void }) {
  const [ns, setNs] = useState<string[]>(current.length ? current : ["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const cleaned = ns.map((n) => n.trim()).filter(Boolean);
      const res = await fetch(`/api/dashboard/domains/${domainId}/nameservers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameservers: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update nameservers.");
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mt-6 p-5">
      <div className="space-y-3">
        {ns.map((val, i) => (
          <input
            key={i}
            className="input"
            placeholder={`Nameserver ${i + 1}`}
            value={val}
            onChange={(e) => setNs(ns.map((v, idx) => (idx === i ? e.target.value : v)))}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setNs([...ns, ""])} className="btn-secondary">Add another</button>
        <button onClick={handleSave} disabled={submitting} className="btn-primary">Save nameservers</button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
