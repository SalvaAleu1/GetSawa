import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createCampaignSchema = z.object({
  action: z.literal("CREATE_CAMPAIGN"),
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  channel: z.enum(["LINK","EMAIL","SOCIAL","PARTNER","INTERNAL"]).default("LINK"),
  destinationPath: z.string().regex(/^\/[A-Za-z0-9/?&=_\-%.]*$/),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});
const campaignStatusSchema = z.object({ action: z.literal("CAMPAIGN_STATUS"), id: z.string().min(1), status: z.enum(["DRAFT","SCHEDULED","ACTIVE","PAUSED","ENDED"]) });
const announcementSchema = z.object({ action: z.literal("CREATE_ANNOUNCEMENT"), title: z.string().min(2).max(140), body: z.string().min(2).max(500), audience: z.string().max(40).default("ALL"), isActive: z.boolean().default(false) });
const adSchema = z.object({ action: z.literal("CREATE_AD"), placement: z.enum(["homepage_banner","dashboard_banner","checkout","sidebar","popup"]), title: z.string().min(2).max(140), subtitle: z.string().max(300).optional(), ctaLabel: z.string().max(60).optional(), ctaUrl: z.string().regex(/^\//).optional(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(), priority: z.number().int().min(0).max(1000).default(0), isActive: z.boolean().default(false) });
const cmsSchema = z.object({ action: z.literal("UPSERT_CMS"), key: z.string().regex(/^[a-z0-9._-]{3,100}$/), content: z.record(z.string(), z.unknown()), isActive: z.boolean().default(true) });
const toggleSchema = z.object({ action: z.literal("TOGGLE_CONTENT"), kind: z.enum(["ADVERTISEMENT","ANNOUNCEMENT","CMS"]), id: z.string().min(1), active: z.boolean() });
const actionSchema = z.discriminatedUnion("action", [createCampaignSchema, campaignStatusSchema, announcementSchema, adSchema, cmsSchema, toggleSchema]);

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN","ADMIN","CONTENT_MANAGER","FINANCE"]);
    const [campaigns, ads, announcements, sections, posts, commissions, affiliateSummary] = await Promise.all([
      prisma.$queryRaw<Array<{ id:string; name:string; slug:string; status:string; channel:string; destination_path:string; starts_at:Date|null; ends_at:Date|null; clicks:bigint; conversions:bigint; value_cents:bigint }>>`
        SELECT c.*,COUNT(e.*) FILTER (WHERE e."event_type"='CLICK') AS clicks,COUNT(e.*) FILTER (WHERE e."event_type"='ORDER_PAID') AS conversions,COALESCE(SUM(e."value_cents") FILTER (WHERE e."event_type"='ORDER_PAID'),0) AS value_cents
        FROM "growth_campaigns" c LEFT JOIN "growth_events" e ON e."campaign_id"=c."id"
        GROUP BY c."id" ORDER BY c."created_at" DESC`,
      prisma.advertisement.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }], take: 50 }),
      prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.cmsSection.findMany({ orderBy: { key: "asc" } }),
      prisma.blogPost.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.commission.findMany({ where: { status: { in: ["PENDING","APPROVED"] } }, orderBy: { createdAt: "asc" }, take: 50, include: { affiliate: { include: { user: { select: { email: true, firstName: true, lastName: true } } } }, order: { select: { id: true, orderNumber: true, status: true, totalCents: true, currency: true, payments: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 } } } } }),
      prisma.$queryRaw<Array<{ pending_cents: bigint; approved_cents: bigint; paid_cents: bigint; clicks: bigint }>>`
        SELECT
          COALESCE((SELECT SUM("amountCents") FROM "Commission" WHERE "status"='PENDING'),0) AS pending_cents,
          COALESCE((SELECT SUM("amountCents") FROM "Commission" WHERE "status"='APPROVED'),0) AS approved_cents,
          COALESCE((SELECT SUM("amountCents") FROM "Commission" WHERE "status"='PAID'),0) AS paid_cents,
          COALESCE((SELECT COUNT(*) FROM "AffiliateClick"),0) AS clicks`,
    ]);
    return jsonOk({
      campaigns: campaigns.map((c) => ({ ...c, clicks: Number(c.clicks), conversions: Number(c.conversions), value_cents: Number(c.value_cents) })),
      ads, announcements, sections, blog: posts, commissions,
      affiliateSummary: affiliateSummary[0] ? { pendingCents: Number(affiliateSummary[0].pending_cents), approvedCents: Number(affiliateSummary[0].approved_cents), paidCents: Number(affiliateSummary[0].paid_cents), clicks: Number(affiliateSummary[0].clicks) } : null,
    });
  } catch (error) { return handleError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN","ADMIN","CONTENT_MANAGER"]);
    const input = actionSchema.parse(await req.json());
    if (input.action === "CREATE_CAMPAIGN") {
      const startsAt = input.startsAt ? new Date(input.startsAt) : null; const endsAt = input.endsAt ? new Date(input.endsAt) : null;
      if (startsAt && endsAt && endsAt <= startsAt) throw new Error("Campaign end must be after its start.");
      const id = crypto.randomUUID();
      await prisma.$executeRaw`INSERT INTO "growth_campaigns" ("id","name","slug","status","channel","destination_path","starts_at","ends_at","created_by") VALUES (${id},${input.name},${input.slug.toLowerCase()},'DRAFT',${input.channel},${input.destinationPath},${startsAt},${endsAt},${admin.id})`;
      await logAudit({ actorId: admin.id, action: "growth.campaign_created", resource: "growth_campaign", resourceId: id, metadata: { slug: input.slug } });
      return jsonOk({ id }, 201);
    }
    if (input.action === "CAMPAIGN_STATUS") {
      const rows = await prisma.$queryRaw<Array<{ starts_at:Date|null; ends_at:Date|null }>>`SELECT "starts_at","ends_at" FROM "growth_campaigns" WHERE "id"=${input.id} LIMIT 1`;
      if (!rows[0]) throw new Error("Campaign not found.");
      const now = new Date();
      if (input.status === "ACTIVE" && rows[0].starts_at && rows[0].starts_at > now) throw new Error("A future campaign must remain SCHEDULED until its start time.");
      if (input.status === "ACTIVE" && rows[0].ends_at && rows[0].ends_at <= now) throw new Error("An ended campaign cannot be activated.");
      await prisma.$executeRaw`UPDATE "growth_campaigns" SET "status"=${input.status},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${input.id}`;
      await logAudit({ actorId: admin.id, action: "growth.campaign_status_changed", resource: "growth_campaign", resourceId: input.id, metadata: { status: input.status } });
      return jsonOk({ updated: true });
    }
    if (input.action === "CREATE_ANNOUNCEMENT") {
      const item = await prisma.announcement.create({ data: { title: input.title, body: input.body, audience: input.audience, isActive: input.isActive } });
      await logAudit({ actorId: admin.id, action: "cms.announcement_created", resource: "announcement", resourceId: item.id });
      return jsonOk({ item }, 201);
    }
    if (input.action === "CREATE_AD") {
      const item = await prisma.advertisement.create({ data: { placement: input.placement, title: input.title, subtitle: input.subtitle, ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, priority: input.priority, isActive: input.isActive } });
      await logAudit({ actorId: admin.id, action: "cms.ad_created", resource: "advertisement", resourceId: item.id });
      return jsonOk({ item }, 201);
    }
    if (input.action === "UPSERT_CMS") {
      const item = await prisma.cmsSection.upsert({ where: { key: input.key }, create: { key: input.key, content: input.content as any, isActive: input.isActive }, update: { content: input.content as any, isActive: input.isActive } });
      await logAudit({ actorId: admin.id, action: "cms.section_upserted", resource: "cms_section", resourceId: item.id, metadata: { key: input.key } });
      return jsonOk({ item });
    }
    if (input.kind === "ADVERTISEMENT") await prisma.advertisement.update({ where: { id: input.id }, data: { isActive: input.active } });
    if (input.kind === "ANNOUNCEMENT") await prisma.announcement.update({ where: { id: input.id }, data: { isActive: input.active } });
    if (input.kind === "CMS") await prisma.cmsSection.update({ where: { id: input.id }, data: { isActive: input.active } });
    await logAudit({ actorId: admin.id, action: "cms.content_toggled", resource: input.kind.toLowerCase(), resourceId: input.id, metadata: { active: input.active } });
    return jsonOk({ updated: true });
  } catch (error) { return handleError(error); }
}
