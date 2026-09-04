"use client";

import { useEffect, useState } from "react";

interface ProviderStatus {
  provider: string;
  label: string;
  isConfigured: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/providers");
    const data = await res.json();
    setProviders(data.providers || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function runTest(provider: string) {
    setTesting(provider);
    await fetch("/api/admin/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    await load();
    setTesting(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Providers</h1>
      <p className="mt-1 text-sm text-ink/60">
        Configuration is read from environment variables, never shown here. Run a live test to confirm connectivity — this never fakes success.
      </p>

      <div className="card mt-6 divide-y divide-border">
        {providers.map((p) => (
          <div key={p.provider} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold">{p.label}</p>
              <p className="text-xs text-ink/50">
                {p.isConfigured ? "Configured" : "Not configured"}
                {p.lastTestedAt ? ` · last tested ${new Date(p.lastTestedAt).toLocaleString()}` : ""}
              </p>
              {p.lastTestMessage && (
                <p className={`mt-1 text-xs ${p.lastTestOk ? "text-success" : "text-danger"}`}>{p.lastTestMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusDot ok={p.isConfigured ? p.lastTestOk : false} configured={p.isConfigured} />
              {["namesilo", "paypal", "ai"].includes(p.provider) && (
                <button onClick={() => runTest(p.provider)} disabled={testing === p.provider} className="btn-secondary">
                  {testing === p.provider ? "Testing…" : "Test connection"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ ok, configured }: { ok: boolean | null; configured: boolean }) {
  const label = !configured ? "Not configured" : ok === null ? "Untested" : ok ? "Operational" : "Error";
  const cls = !configured ? "badge-neutral" : ok === null ? "badge-neutral" : ok ? "badge-success" : "badge-danger";
  return <span className={cls}>{label}</span>;
}
