import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { decryptTotpSecret, verifyTotp } from "@/lib/mfa";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("login", ip, { max: 15, windowMs: 5 * 60_000 });
    if (!rl.allowed) return jsonError("Too many login attempts. Please try again later.", 429);

    const { email, password, mfaCode } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const userAgent = req.headers.get("user-agent") || undefined;

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      if (user) await prisma.loginEvent.create({ data: { userId: user.id, success: false, ipAddress: ip, userAgent, reason: "bad_password" } });
      return jsonError("Invalid email or password.", 401);
    }

    if (user.isSuspended) {
      await prisma.loginEvent.create({ data: { userId: user.id, success: false, ipAddress: ip, userAgent, reason: "suspended" } });
      return jsonError("This account has been suspended. Contact support for help.", 403);
    }

    if (user.mfaEnabled) {
      if (!mfaCode) return jsonError("MFA code required.", 401, { code: "MFA_REQUIRED" });
      if (!user.mfaSecret || !verifyTotp(decryptTotpSecret(user.mfaSecret), mfaCode)) {
        await prisma.loginEvent.create({ data: { userId: user.id, success: false, ipAddress: ip, userAgent, reason: "bad_mfa" } });
        return jsonError("Invalid MFA code.", 401);
      }
    }

    const { jwt } = await createSession(user.id, ip, userAgent);
    await setSessionCookie(jwt);
    await prisma.loginEvent.create({ data: { userId: user.id, success: true, ipAddress: ip, userAgent, reason: user.mfaEnabled ? "password_and_mfa" : undefined } });
    await logAudit({ actorId: user.id, action: "user.login", resource: "user", resourceId: user.id, ipAddress: ip });

    return jsonOk({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isAdmin: Boolean(user.adminRole), mfaEnabled: user.mfaEnabled } });
  } catch (err) {
    return handleError(err);
  }
}
