import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return jsonError("Missing token.", 400);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return jsonError("This verification link is invalid or has expired.", 400);
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
