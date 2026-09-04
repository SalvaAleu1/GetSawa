import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailTemplates } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const horizons = [7, 30, 60];
  let sent = 0;

  for (const days of horizons) {
    const from = new Date(now.getTime() + (days - 1) * 86400000);
    const to = new Date(now.getTime() + (days + 1) * 86400000);
    const domains = await prisma.domain.findMany({
      where: { status: { in: ["ACTIVE", "EXPIRING"] }, expiresAt: { gte: from, lte: to } },
      include: { user: true },
      take: 200,
    });

    for (const domain of domains) {
      // Notification uniqueness is intentionally represented by a stable
      // type/title/body tuple for this job. If a notification already exists
      // for the same horizon, do not send another email.
      const type = `DOMAIN_RENEWAL_${days}`;
      const exists = await prisma.notification.findFirst({ where: { userId: domain.userId, type, body: { contains: domain.name } } });
      if (exists) continue;

      const body = `Your domain ${domain.name} expires on ${domain.expiresAt?.toDateString()}. Renew it before expiry to keep your website and email online.`;
      await prisma.notification.create({ data: { userId: domain.userId, type, title: `Renew ${domain.name}`, body } });

      try {
        const template = emailTemplates.domainRenewalReminder(domain.name, domain.expiresAt?.toDateString() || "");
        await sendEmail({ to: domain.user.email, ...template });
        sent++;
      } catch (error) {
        console.error("renewal reminder email failed", domain.name, error);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, timestamp: new Date().toISOString() });
}
