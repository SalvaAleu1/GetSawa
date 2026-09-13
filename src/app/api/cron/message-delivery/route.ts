import { NextRequest } from "next/server";
import { retryMessageDeliveries } from "@/lib/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await retryMessageDeliveries(100);
  return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}
