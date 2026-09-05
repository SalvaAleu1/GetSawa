import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { reconcilePendingPayPalPayments } from "@/lib/payment-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return jsonError("Cron authentication is not configured.", 503);
  const supplied = req.headers.get("authorization");
  if (supplied !== `Bearer ${expected}`) return jsonError("Unauthorized.", 401);

  try {
    const result = await reconcilePendingPayPalPayments(50);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Payment reconciliation failed.", 503);
  }
}
