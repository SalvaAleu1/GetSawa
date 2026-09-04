import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const { token, password } = schema.parse(await req.json());
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return jsonError("This reset link is invalid or has expired.", 400);
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: record.userId } }), // revoke all sessions
    ]);

    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
