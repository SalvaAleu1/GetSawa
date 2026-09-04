export const dynamic = "force-dynamic";

import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "https://getsawa.app";
  const [tlds, posts] = await Promise.all([
    prisma.tld.findMany({ where: { isActive: true }, select: { extension: true } }),
    prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
  ]);
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/domains/premium`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/domains/auctions`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
  return [...staticPages, ...tlds.map((t) => ({ url: `${base}/domains/${t.extension}`, changeFrequency: "weekly" as const, priority: 0.5 })), ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 }))];
}
