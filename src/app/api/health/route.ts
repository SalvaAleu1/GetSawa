import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, string> = {
    database: "unknown",
    namesilo: getDomainProvider().isConfigured() ? "configured" : "not_configured",
    paypal: PayPalProvider.isConfigured() ? "configured" : "not_configured",
    smtp: isEmailConfigured() ? "configured" : "not_configured",
    hosting: process.env.HOSTING_API_KEY && process.env.HOSTING_API_BASE_URL ? "configured" : "not_configured",
    businessEmail: process.env.EMAIL_PROVIDER_API_KEY ? "configured" : "not_configured",
    ai: getAIProvider().isConfigured() ? "configured" : "not_configured",
    storage: process.env.STORAGE_PROVIDER && process.env.STORAGE_BUCKET ? "configured" : "not_configured",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = checks.database === "ok";
  return NextResponse.json(
    { ok: healthy, service: "getsawa", version: process.env.VERCEL_GIT_COMMIT_SHA || "unknown", latencyMs: Date.now() - started, timestamp: new Date().toISOString(), checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
