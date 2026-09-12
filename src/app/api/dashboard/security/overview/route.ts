import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const [loginEvents, activeSessions, domainCount, orderCount] = await Promise.all([
      prisma.loginEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          success: true,
          ipAddress: true,
          userAgent: true,
          reason: true,
          createdAt: true,
        },
      }),
      prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
      prisma.domain.count({ where: { userId: user.id } }),
      prisma.order.count({ where: { userId: user.id } }),
    ]);

    const profileComplete = Boolean(user.firstName && user.lastName && user.phone && user.country);
    const checklist = [
      { key: "email", label: "Verify email address", complete: Boolean(user.emailVerifiedAt) },
      { key: "profile", label: "Complete contact profile", complete: profileComplete },
      { key: "mfa", label: "Enable two-factor authentication", complete: user.mfaEnabled },
      { key: "first-service", label: "Add your first GetSawa service", complete: domainCount > 0 || orderCount > 0 },
    ];
    const completed = checklist.filter((item) => item.complete).length;

    return jsonOk({
      security: {
        emailVerified: Boolean(user.emailVerifiedAt),
        mfaEnabled: user.mfaEnabled,
        activeSessions,
        recentFailedLogins: loginEvents.filter((event) => !event.success).length,
      },
      onboarding: {
        completed,
        total: checklist.length,
        percent: Math.round((completed / checklist.length) * 100),
        checklist,
      },
      loginEvents,
    });
  } catch (error) {
    return handleError(error);
  }
}
