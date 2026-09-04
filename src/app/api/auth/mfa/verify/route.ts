import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptTotpSecret, verifyTotp } from "@/lib/mfa";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ token: z.string().regex(/^\d{6}$/) });
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { token } = schema.parse(await req.json());
    const secret = user.mfaSecret ? decryptTotpSecret(user.mfaSecret) : null;
    if (!secret || !verifyTotp(secret, token)) return jsonError("Invalid MFA code.", 400);
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await logAudit({ actorId: user.id, action: "security.mfa_enabled", resource: "user", resourceId: user.id });
    return jsonOk({ enabled: true });
  } catch (err) {
    return handleError(err);
  }
}
