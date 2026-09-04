import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  placement: z.enum(["homepage_banner", "dashboard_banner", "domain_search", "sidebar", "popup", "announcement_bar", "checkout", "marketplace"]),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).optional(),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().max(500).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(false),
});

export async function GET() {
  try {
    await requireAdmin();
    const ads = await prisma.advertisement.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    return jsonOk({ ads });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"]);
    const input = schema.parse(await req.json());
    const ad = await prisma.advertisement.create({
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      },
    });
    await logAudit({ actorId: admin.id, action: "ad.created", resource: "advertisement", resourceId: ad.id });
    return jsonOk({ ad }, 201);
  } catch (err) {
    return handleError(err);
  }
}
