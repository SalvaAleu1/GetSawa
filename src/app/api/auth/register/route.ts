import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { sendEmail, emailTemplates } from "@/lib/email";

const schema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  phone: z.string().max(30).optional(),
  country: z.string().max(2).optional(),
  company: z.string().max(150).optional(),
  acceptedTerms: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("register", ip, { max: 10, windowMs: 60_000 });
    if (!rl.allowed) return jsonError("Too many attempts. Please try again shortly.", 429);

    const body = schema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      // Do not reveal whether the account exists to avoid enumeration.
      return jsonError("If this email can be registered, you'll receive a confirmation shortly.", 200);
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        country: body.country,
        company: body.company,
        referralCode: crypto.randomBytes(4).toString("hex"),
      },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${rawToken}`;
    const template = emailTemplates.verifyEmail(verifyUrl);
    await sendEmail({ to: user.email, ...template });

    const { jwt } = await createSession(user.id, ip, req.headers.get("user-agent") || undefined);
    await setSessionCookie(jwt);

    await logAudit({ actorId: user.id, action: "user.register", resource: "user", resourceId: user.id, ipAddress: ip });

    return jsonOk({
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    }, 201);
  } catch (err) {
    return handleError(err);
  }
}
