import { NextRequest } from "next/server";
import { captureDailyAnalyticsSnapshot } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({error:"Unauthorized"},{status:401});
  const snapshot = await captureDailyAnalyticsSnapshot();
  return Response.json({ok:true,snapshotDate:snapshot.snapshotDate.toISOString(),timestamp:new Date().toISOString()});
}
