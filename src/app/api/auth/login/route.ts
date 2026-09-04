import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("login", ip, { max: 15, windowMs: 5 * 60_000 });
    if (!rl.allowed) return jsonError("Too many login attempts. Please try again later.", 429);

    const { email, password } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    const userAgent = req.headers.get("user-agent") || undefined;

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      if (user) {
        await prisma.loginEvent.create({
          data: { userId: user.id, success: false, ipAddress: ip, userAgent, reason: "bad_password" },
        });
      }
      return jsonError("Invalid email or password.", 401);
    }

    if (user.isSuspended) {
      await prisma.loginEvent.create({
        data: { userId: user.id, success: false, ipAddress: ip, userAgent, reason: "suspended" },
      });
      return jsonError("This account has been suspended. Contact support for help.", 403);
    }

    const { jwt } = await createSession(user.id, ip, userAgent);
    await setSessionCookie(jwt);
    await prisma.loginEvent.create({ data: { userId: user.id, success: true, ipAddress: ip, userAgent } });
    await logAudit({ actorId: user.id, action: "user.login", resource: "user", resourceId: user.id, ipAddress: ip });

    return jsonOk({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: Boolean(user.adminRole),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
