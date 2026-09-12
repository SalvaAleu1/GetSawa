import { NextRequest, NextResponse } from "next/server";
import { syncWholesalePricing } from "@/lib/domain-pricing-sync";

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

  try {
    const result = await syncWholesalePricing();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("pricing-sync failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Pricing sync failed." },
      { status: 503 },
    );
  }
}
