import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const CAMPAIGN_COOKIE = "gs_campaign";
const TTL_SECONDS = 30 * 24 * 60 * 60;

type CampaignRow = { id: string; slug: string; destination_path: string; status: string; starts_at: Date | null; ends_at: Date | null };

export async function findLiveCampaign(slug: string): Promise<CampaignRow | null> {
  const rows = await prisma.$queryRaw<CampaignRow[]>`
    SELECT "id","slug","destination_path","status","starts_at","ends_at" FROM "growth_campaigns" WHERE "slug"=${slug.toLowerCase()} LIMIT 1
  `;
  const campaign = rows[0];
  if (!campaign || campaign.status !== "ACTIVE") return null;
  const now = Date.now();
  if (campaign.starts_at && campaign.starts_at.getTime() > now) return null;
  if (campaign.ends_at && campaign.ends_at.getTime() <= now) return null;
  return campaign;
}

export async function recordCampaignClick(campaign: CampaignRow, metadata: Record<string, unknown> = {}) {
  const eventKey = `click:${campaign.id}:${crypto.randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO "growth_events" ("id","event_key","campaign_id","event_type","metadata")
    VALUES (${crypto.randomUUID()},${eventKey},${campaign.id},'CLICK',${JSON.stringify(metadata)}::jsonb)
  `;
  const store = await cookies();
  store.set(CAMPAIGN_COOKIE, campaign.slug, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TTL_SECONDS });
}

export async function recordGrowthConversionForOrder(orderId: string, userId: string) {
  const store = await cookies();
  const slug = store.get(CAMPAIGN_COOKIE)?.value;
  if (!slug) return false;
  const campaign = await findLiveCampaign(slug);
  if (!campaign) return false;
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, select: { id: true, totalCents: true } });
  if (!order) return false;
  await prisma.$executeRaw`
    INSERT INTO "growth_events" ("id","event_key","campaign_id","user_id","order_id","event_type","value_cents")
    VALUES (${crypto.randomUUID()},${`order:${order.id}`},${campaign.id},${userId},${order.id},'ORDER_PAID',${order.totalCents})
    ON CONFLICT ("event_key") DO NOTHING
  `;
  return true;
}
