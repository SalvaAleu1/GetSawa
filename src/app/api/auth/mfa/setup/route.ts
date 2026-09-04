import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptTotpSecret, generateTotpSecret, buildOtpAuthUri } from "@/lib/mfa";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.mfaEnabled) return jsonError("MFA is already enabled.", 409);
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encryptTotpSecret(secret) } });
    return jsonOk({ secret, otpAuthUri: buildOtpAuthUri(secret, user.email) });
  } catch (err) {
    return handleError(err);
  }
}
