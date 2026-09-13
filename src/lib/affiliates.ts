import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { percentOfCents } from "@/lib/money";

const REFERRAL_COOKIE = "gs_ref";
const REFERRAL_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function setReferralCookie(affiliateId: string) {
  const cookieStore = await cookies();
  cookieStore.set(REFERRAL_COOKIE, affiliateId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: REFERRAL_COOKIE_TTL_SECONDS });
}

export async function recordCommissionForOrder(orderId: string, userId: string) {
  const cookieStore = await cookies();
  const affiliateId = cookieStore.get(REFERRAL_COOKIE)?.value;
  if (!affiliateId) return false;
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate || affiliate.status !== "ACTIVE" || affiliate.userId === userId) return false;
  const priorPaidOrders = await prisma.order.count({ where: { userId, status: { in: ["ACTIVE", "PAYMENT_CONFIRMED", "PROVISIONING"] }, id: { not: orderId } } });
  if (priorPaidOrders > 0) return false;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return false;
  const amountCents = percentOfCents(order.totalCents, Number(affiliate.commissionPercent));
  if (amountCents <= 0) return false;
  const result = await prisma.commission.createMany({ data: [{ affiliateId: affiliate.id, orderId: order.id, amountCents, status: "PENDING" }], skipDuplicates: true });
  return result.count === 1;
}
