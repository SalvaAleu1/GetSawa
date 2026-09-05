import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === secret;
}

/**
 * Reconciles locally-known domain expiry state.
 *
 * This job never attempts a registrar renewal on its own. Renewal requires a
 * confirmed payment/provider operation. It only moves domains whose registry
 * expiry timestamp is already in the past to EXPIRED and creates a durable
 * customer notification. The hourly domain-sync job remains authoritative for
 * registrar state and can move the domain back to the appropriate status.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.domain.findMany({
    where: {
      status: { in: ["ACTIVE", "EXPIRING"] },
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      name: true,
      userId: true,
      expiresAt: true,
    },
    take: 500,
  });

  let expired = 0;
  let notified = 0;

  for (const domain of candidates) {
    const result = await prisma.domain.updateMany({
      where: {
        id: domain.id,
        status: { in: ["ACTIVE", "EXPIRING"] },
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    if (result.count === 0) continue;
    expired++;

    const type = "DOMAIN_EXPIRED";
    const existing = await prisma.notification.findFirst({
      where: {
        userId: domain.userId,
        type,
        body: { contains: domain.name },
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: domain.userId,
          type,
          title: `Domain expired: ${domain.name}`,
          body: `Your domain ${domain.name} reached its recorded expiry date. Check your registrar status and renew as soon as possible if renewal is still available.`,
        },
      });
      notified++;
    }
  }

  return NextResponse.json({
    ok: true,
    inspected: candidates.length,
    expired,
    notified,
    timestamp: now.toISOString(),
  });
}
