import { NextRequest } from "next/server";
import { processDueRenewals } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await processDueRenewals(100);
  return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}
