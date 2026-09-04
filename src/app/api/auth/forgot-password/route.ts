import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendEmail, emailTemplates } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit("forgot-password", ip, { max: 5, windowMs: 15 * 60_000 });
    if (!rl.allowed) return jsonOk({ success: true }); // don't reveal rate limiting to a potential attacker

    const { email } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always respond the same way whether or not the account exists.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const resetUrl = `${process.env.APP_URL}/reset-password?token=${rawToken}`;
      const template = emailTemplates.passwordReset(resetUrl);
      await sendEmail({ to: user.email, ...template });
    }

    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
