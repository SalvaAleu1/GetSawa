import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { provisionOrder } from "@/lib/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_CLAIM_MS = 15 * 60 * 1000;
const MAX_ORDERS = 50;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === secret;
}

/**
 * Recovers paid fulfilment work left in PROVISIONING after a worker timeout.
 * Failed orders are intentionally not auto-retried here; an administrator can
 * explicitly retry them after reviewing the failure.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - STALE_CLAIM_MS);
  const candidates = await prisma.orderItem.findMany({
    where: {
      provisioningStatus: "PROVISIONING",
      provisioningNote: { startsWith: "CLAIMED:" },
      createdAt: { lt: new Date() },
      order: { status: "PROVISIONING" },
    },
    select: { id: true, orderId: true, provisioningNote: true },
    take: MAX_ORDERS * 5,
  });

  const orderIds = [...new Set(
    candidates
      .filter((item) => {
        const timestamp = item.provisioningNote?.slice("CLAIMED:".length) || "";
        const claimedAt = Date.parse(timestamp);
        return Number.isFinite(claimedAt) && claimedAt < cutoff.getTime();
      })
      .map((item) => item.orderId),
  )].slice(0, MAX_ORDERS);

  let recovered = 0;
  let failed = 0;
  for (const orderId of orderIds) {
    try {
      await provisionOrder(orderId);
      recovered++;
    } catch (error) {
      failed++;
      console.error("provisioning-recovery failed", { orderId, error });
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    inspected: candidates.length,
    eligibleOrders: orderIds.length,
    recovered,
    failed,
    timestamp: new Date().toISOString(),
  });
}
