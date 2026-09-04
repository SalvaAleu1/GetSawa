export const dynamic = "force-dynamic";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { prisma } from "@/lib/prisma";

export default async function BlogListPage() {
  const posts = await prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true, excerpt: true, publishedAt: true } });
  return (<><Navbar /><main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold">Blog</h1>{posts.length === 0 ? <p className="mt-6 text-ink/60">No posts published yet.</p> : <div className="mt-6 space-y-6">{posts.map((p) => <Link key={p.slug} href={`/blog/${p.slug}`} className="card block p-5"><p className="text-xs text-ink/50">{p.publishedAt && new Date(p.publishedAt).toDateString()}</p><h2 className="mt-1 text-lg font-semibold">{p.title}</h2>{p.excerpt && <p className="mt-1 text-sm text-ink/60">{p.excerpt}</p>}</Link>)}</div>}</main></>);
}
