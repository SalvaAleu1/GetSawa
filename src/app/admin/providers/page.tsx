"use client";

import { useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/client-response";

interface ProviderStatus {
  provider: string;
  label: string;
  isConfigured: boolean;
  operational?: boolean;
  operationalReason?: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  metadata?: Record<string, unknown> | null;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [runtimeHost, setRuntimeHost] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/admin/providers", { cache: "no-store" });
    const data = await readJsonResponse<{ providers?: ProviderStatus[]; data?: { providers?: ProviderStatus[] } }>(
      res,
      "Could not load provider status",
    );
    setProviders(data.providers || data.data?.providers || []);
  }

  useEffect(() => {
    setRuntimeHost(window.location.host);
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load provider status."));
  }, []);

  async function runTest(provider: string) {
    setTesting(provider);
    setError(null);
    try {
      const response = await fetch("/api/admin/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      await readJsonResponse(response, "Provider test failed");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Provider test failed.");
      await load().catch(() => {});
    } finally {
      setTesting(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Providers</h1>
      <p className="mt-1 text-sm text-ink/60">
        Secrets stay in the deployed Worker environment. A provider is operational only after this exact runtime passes its live test.
      </p>
      {runtimeHost && <p className="mt-2 text-xs text-ink/45">Current runtime: {runtimeHost}</p>}
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="card mt-6 divide-y divide-border">
        {providers.map((provider) => {
          const canTest = ["namesilo", "paypal", "smtp", "hosting", "email_hosting", "cloudflare_security", "ai"].includes(provider.provider);
          const hasGate = ["hosting", "email_hosting", "cloudflare_security"].includes(provider.provider);
          const verified = hasGate ? provider.operational === true : provider.lastTestOk === true;
          return (
            <div key={provider.provider} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{provider.label}</p>
                <p className="text-xs text-ink/50">
                  {provider.isConfigured ? "Environment configured" : "Not configured"}
                  {provider.lastTestedAt ? ` · last tested ${new Date(provider.lastTestedAt).toLocaleString()}` : ""}
                </p>
                {(provider.operationalReason || provider.lastTestMessage) && (
                  <p className={`mt-1 text-xs ${verified ? "text-success" : "text-danger"}`}>
                    {provider.operationalReason || provider.lastTestMessage}
                  </p>
                )}
                {provider.provider === "email_hosting" && verified && provider.metadata ? (
                  <p className="mt-1 text-xs text-ink/50">
                    Cluster {String(provider.metadata.cluster || "—")} · {String(provider.metadata.imapSmtpHost || "mail host unavailable")}
                  </p>
                ) : null}
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
  const cls = !configured || ok === null ? "badge-neutral" : ok ? "badge-success" : "badge-danger";
  return <span className={cls}>{label}</span>;
}
