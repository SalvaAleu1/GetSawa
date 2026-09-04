import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {
    namesilo: getDomainProvider().isConfigured() ? "configured" : "not_configured",
    paypal: PayPalProvider.isConfigured() ? "configured" : "not_configured",
    database: "unknown",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = checks.database === "ok";
  return NextResponse.json(
    {
      ok: healthy,
      service: "getsawa",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
