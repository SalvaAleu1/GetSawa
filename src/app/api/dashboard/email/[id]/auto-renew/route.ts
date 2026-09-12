import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { setEmailAutoRenew } from "@/lib/email-billing";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Invalid renewal setting.", 422);
    await setEmailAutoRenew(user.id, id, parsed.data.enabled);
    return jsonOk({ serviceId: id, autoRenew: parsed.data.enabled, cancelAtPeriodEnd: !parsed.data.enabled });
  } catch (error) {
    return handleError(error);
  }
}
