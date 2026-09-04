import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  excerpt: z.string().max(500).optional(),
  body: z.string().min(1),
  featuredImageUrl: z.string().url().optional(),
  seoTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export async function GET() {
  try {
    await requireAdmin();
    const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } });
    return jsonOk({ posts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"]);
    const input = createSchema.parse(await req.json());

    const post = await prisma.blogPost.create({
      data: {
        ...input,
        authorId: admin.id,
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      },
    });

    await logAudit({ actorId: admin.id, action: "blog.created", resource: "blog_post", resourceId: post.id });
    return jsonOk({ post }, 201);
  } catch (err) {
    return handleError(err);
  }
}
