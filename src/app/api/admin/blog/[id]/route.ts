import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  body: z.string().min(1).optional(),
  featuredImageUrl: z.string().url().nullable().optional(),
  seoTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"]);
    const { id } = await params;
    const input = updateSchema.parse(await req.json());
    const existing = await prisma.blogPost.findUnique({ where: { id } });

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        ...input,
        publishedAt: input.status === "PUBLISHED" && existing?.status !== "PUBLISHED" ? new Date() : undefined,
      },
    });

    await logAudit({ actorId: admin.id, action: "blog.updated", resource: "blog_post", resourceId: post.id });
    return jsonOk({ post });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"]);
    const { id } = await params;
    await prisma.blogPost.delete({ where: { id } });
    await logAudit({ actorId: admin.id, action: "blog.deleted", resource: "blog_post", resourceId: id });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
