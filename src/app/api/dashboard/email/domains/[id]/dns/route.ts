import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { applyEmailDnsCutover, inspectEmailDns } from "@/lib/email-domains";

type RouteContext = { params: Promise<{ id: string }> };
const applySchema = z.object({ confirmed: z.literal(true) });

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return jsonOk(await inspectEmailDns(user.id, id));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = applySchema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Explicit DNS cutover confirmation is required.", 422);
    return jsonOk(await applyEmailDnsCutover({ userId: user.id, domainId: id, confirmed: true }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("external DNS")) return jsonError(error.message, 409);
    return handleError(error);
  }
}
