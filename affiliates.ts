import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { percentOfCents } from "@/lib/money";

const REFERRAL_COOKIE = "gs_ref";
const REFERRAL_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function setReferralCookie(affiliateId: string) {
  cookies().set(REFERRAL_COOKIE, affiliateId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_COOKIE_TTL_SECONDS,
  });
}

/**
 * Called once a customer's order is confirmed paid. If they arrived via a
 * referral link within the cookie window, and this is their first paid
 * order (so referrers are rewarded for new customers, not repeat self-
 * referrals), records a pending commission for the referring affiliate.
 * Never pays anyone directly here — admin approval + a real PayPal payout
 * happen separately (spec: commissions have PENDING/APPROVED/PAID states).
 */
export async function recordCommissionForOrder(orderId: string, userId: string) {
  const affiliateId = cookies().get("gs_ref")?.value;
  if (!affiliateId) return;

  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate || affiliate.status !== "ACTIVE" || affiliate.userId === userId) return;

  const priorPaidOrders = await prisma.order.count({
    where: { userId, status: { in: ["ACTIVE", "PAYMENT_CONFIRMED", "PROVISIONING"] }, id: { not: orderId } },
  });
  if (priorPaidOrders > 0) return; // reward first-order referrals only

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const amountCents = percentOfCents(order.totalCents, Number(affiliate.commissionPercent));
  if (amountCents <= 0) return;

  await prisma.commission.create({
    data: { affiliateId: affiliate.id, orderId: order.id, amountCents, status: "PENDING" },
  });
}
