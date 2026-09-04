import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  audience: z.enum(["ALL", "NEW_CUSTOMERS", "BUSINESS", "HOSTING", "DOMAINS"]).default("ALL"),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
    return jsonOk({ announcements });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"]);
    const input = schema.parse(await req.json());
    const announcement = await prisma.announcement.create({ data: input });
    await logAudit({ actorId: admin.id, action: "announcement.created", resource: "announcement", resourceId: announcement.id });
    return jsonOk({ announcement }, 201);
  } catch (err) {
    return handleError(err);
  }
}
