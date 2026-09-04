import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

async function getPost(slug: string) {
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") return null;
  return post;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return { title: post.seoTitle || post.title, description: post.metaDescription || post.excerpt || undefined };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  // Body is stored as plain markdown text; rendered here as simple
  // paragraphs (split on blank lines) rather than pulling in a markdown
  // rendering dependency this environment couldn't verify by installing.
  // Swap in a proper markdown renderer (e.g. `marked` + sanitization) if
  // richer formatting is needed.
  const paragraphs = post.body.split(/\n\s*\n/);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-xs text-ink/50">{post.publishedAt && new Date(post.publishedAt).toDateString()}</p>
        <h1 className="mt-1 text-3xl font-semibold">{post.title}</h1>
        <div className="prose mt-6 space-y-4 text-ink/80">
          {paragraphs.map((p, i) => (
            <p key={i} className="leading-relaxed">{p}</p>
          ))}
        </div>
      </main>
    </>
  );
}
