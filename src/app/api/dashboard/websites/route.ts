import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  businessDescription: z.string().min(1).max(2000),
  category: z.string().max(100).optional(),
  tone: z.string().max(100).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await prisma.websiteProject.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return jsonOk({ projects });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await req.json());

    const base = slugify(input.name) || "site";
    let slug = base;
    let suffix = 0;
    // Ensure slug uniqueness across the whole platform (slugs are the public URL path).
    while (await prisma.websiteProject.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
      if (suffix > 50) {
        slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
        break;
      }
    }

    const project = await prisma.websiteProject.create({
      data: {
        userId: user.id,
        slug,
        name: input.name,
        businessDescription: input.businessDescription,
        category: input.category,
        tone: input.tone,
        status: "DRAFT",
      },
    });

    await logAudit({ actorId: user.id, action: "website.created", resource: "website_project", resourceId: project.id });

    return jsonOk({ project }, 201);
  } catch (err) {
    return handleError(err);
  }
}
