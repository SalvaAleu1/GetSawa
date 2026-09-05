import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { setDomainAutoRenew } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => null) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") return jsonError("enabled must be a boolean.", 422);
    await setDomainAutoRenew(user.id, id, body.enabled);
    return jsonOk({ domainId: id, autoRenew: body.enabled });
  } catch (error) {
    return handleError(error);
  }
}
