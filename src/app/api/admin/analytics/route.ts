import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAnalyticsOverview } from "@/lib/analytics";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

function parseRange(req: NextRequest) {
  const now = new Date();
  const params = req.nextUrl.searchParams;
  const to = params.get("to") ? new Date(params.get("to") as string) : now;
  const from = params.get("from") ? new Date(params.get("from") as string) : new Date(to.getTime()-30*86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new Error("INVALID_RANGE");
  if (to.getTime()-from.getTime() > 366*86400000) throw new Error("RANGE_TOO_LARGE");
  return { from, to };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(["SUPER_ADMIN","ADMIN","FINANCE"]);
    let range;
    try { range = parseRange(req); } catch (error) { return jsonError(error instanceof Error && error.message === "RANGE_TOO_LARGE" ? "Analytics range cannot exceed 366 days." : "Invalid analytics date range.",422); }
    return jsonOk(await getAnalyticsOverview(range.from,range.to));
  } catch (error) { return handleError(error); }
}
