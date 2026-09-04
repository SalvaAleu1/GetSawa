import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, excerpt: true, featuredImageUrl: true, publishedAt: true, categories: true },
    });
    return jsonOk({ posts });
  } catch (err) {
    return handleError(err);
  }
}
