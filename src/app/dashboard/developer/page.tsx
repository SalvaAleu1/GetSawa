"use client";

import { useEffect, useState } from "react";

interface Key {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/dashboard/api-keys");
    const data = await res.json();
    setKeys(data.keys || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create key.");
      setNewKey(data.key);
      setName("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/dashboard/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Developer API</h1>
      <p className="mt-1 text-sm text-ink/60">
        Use your API key to check domain availability and pricing programmatically. See <code>GET /api/v1/domains/search</code> and{" "}
        <code>GET /api/v1/domains/pricing</code>, authenticated with <code>Authorization: Bearer &lt;key&gt;</code>.
      </p>

      {newKey && (
        <div className="card mt-6 border-amber-400/40 bg-amber-400/5 p-4">
          <p className="font-medium">Copy your new API key now — it won't be shown again.</p>
          <code className="mt-2 block break-all rounded bg-ink/5 p-2 text-sm">{newKey}</code>
        </div>
      )}

      <div className="card mt-6 divide-y divide-border">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-medium">{k.name} <span className="ml-2 font-mono text-xs text-ink/40">{k.keyPrefix}…</span></p>
              <p className="text-xs text-ink/50">{k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}` : "Never used"}</p>
            </div>
            {k.isActive ? (
              <button onClick={() => handleRevoke(k.id)} className="btn-danger">Revoke</button>
            ) : (
              <span className="badge-neutral">Revoked</span>
            )}
          </div>
        ))}
        {keys.length === 0 && <p className="p-5 text-sm text-ink/60">No API keys yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 flex items-end gap-3 p-6">
        <div className="flex-1">
          <label className="label">Key name</label>
          <input className="input" required placeholder="My integration" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creating…" : "Create key"}</button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
