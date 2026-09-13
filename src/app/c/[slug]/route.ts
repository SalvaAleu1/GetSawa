import { NextRequest, NextResponse } from "next/server";
import { findLiveCampaign, recordCampaignClick } from "@/lib/growth-attribution";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await findLiveCampaign(slug);
  const app = new URL(process.env.APP_URL || req.nextUrl.origin);
  if (!campaign || !campaign.destination_path.startsWith("/")) return NextResponse.redirect(new URL("/", app));
  await recordCampaignClick(campaign, { referrer: req.headers.get("referer")?.slice(0, 500) || null });
  return NextResponse.redirect(new URL(campaign.destination_path, app));
}
