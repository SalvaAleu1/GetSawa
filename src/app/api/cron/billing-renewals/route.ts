import { NextRequest } from "next/server";
import { processDueRenewals } from "@/lib/billing";
import { enforceHostingPastDue } from "@/lib/hosting-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const renewals = await processDueRenewals(100);
  const hostingSuspensions = await enforceHostingPastDue(100);
  return Response.json({ ok: true, renewals, hostingSuspensions, timestamp: new Date().toISOString() });
}
