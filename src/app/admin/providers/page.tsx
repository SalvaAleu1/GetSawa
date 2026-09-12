"use client";

import { useEffect, useState } from "react";

interface ProviderStatus {
  provider: string;
  label: string;
  isConfigured: boolean;
  operational?: boolean;
  operationalReason?: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/providers", { cache: "no-store" });
    const data = await res.json();
    setProviders(data.providers || []);
  }

  useEffect(() => { void load(); }, []);

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
        Secrets stay in environment variables. A provider is not considered operational merely because variables exist; run a live test after configuration or credential rotation.
      </p>

      <div className="card mt-6 divide-y divide-border">
        {providers.map((provider) => {
          const canTest = ["namesilo", "paypal", "hosting", "ai"].includes(provider.provider);
          const verified = provider.provider === "hosting" ? provider.operational === true : provider.lastTestOk === true;
          return (
            <div key={provider.provider} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{provider.label}</p>
                <p className="text-xs text-ink/50">
                  {provider.isConfigured ? "Environment configured" : "Not configured"}
                  {provider.lastTestedAt ? ` · last tested ${new Date(provider.lastTestedAt).toLocaleString()}` : ""}
                </p>
                {(provider.operationalReason || provider.lastTestMessage) && (
                  <p className={`mt-1 text-xs ${verified ? "text-success" : "text-danger"}`}>{provider.operationalReason || provider.lastTestMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusDot ok={provider.isConfigured ? verified : false} configured={provider.isConfigured} />
                {canTest && (
                  <button onClick={() => runTest(provider.provider)} disabled={testing === provider.provider} className="btn-secondary">
                    {testing === provider.provider ? "Testing…" : "Test live connection"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({ ok, configured }: { ok: boolean | null; configured: boolean }) {
  const label = !configured ? "Not configured" : ok === null ? "Untested" : ok ? "Operational" : "Not verified";
  const cls = !configured ? "badge-neutral" : ok === null ? "badge-neutral" : ok ? "badge-success" : "badge-danger";
  return <span className={cls}>{label}</span>;
}
