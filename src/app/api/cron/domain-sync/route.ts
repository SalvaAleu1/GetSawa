import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const provider = getDomainProvider();
  if (!provider.isConfigured()) return NextResponse.json({ ok: false, error: "NameSilo is not configured" }, { status: 503 });

  const domains = await prisma.domain.findMany({
    where: { status: { in: ["ACTIVE", "EXPIRING"] } },
    select: { id: true, name: true },
    take: 100,
  });

  let synced = 0;
  let failed = 0;
  for (const domain of domains) {
    try {
      const info = await provider.getDomainInfo(domain.name);
      const expiresAt = info.expiresAt ? new Date(info.expiresAt) : null;
      const expiring = expiresAt ? expiresAt.getTime() - Date.now() <= 30 * 86400000 : false;
      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          expiresAt,
          autoRenew: info.autoRenew,
          isLocked: info.isLocked,
          privacyEnabled: info.privacyEnabled,
          nameservers: info.nameservers,
          status: expiring ? "EXPIRING" : "ACTIVE",
        },
      });
      synced++;
    } catch (error) {
      failed++;
      console.error("domain-sync failed", domain.name, error);
    }
  }

  return NextResponse.json({ ok: failed === 0, synced, failed, processed: domains.length, timestamp: new Date().toISOString() });
}
