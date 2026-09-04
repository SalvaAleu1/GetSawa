import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setReferralCookie } from "@/lib/affiliates";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const affiliate = await prisma.affiliate.findFirst({
    where: { user: { referralCode: params.code }, status: "ACTIVE" },
  });

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  const res = NextResponse.redirect(url);

  if (affiliate) {
    await prisma.affiliateClick.create({ data: { affiliateId: affiliate.id, landingPath: "/" } });
    await setReferralCookie(affiliate.id);
  }

  return res;
}
