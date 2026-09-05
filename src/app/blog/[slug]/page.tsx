import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
async function getPost(slug: string) { const post = await prisma.blogPost.findUnique({ where: { slug } }); if (!post || post.status !== "PUBLISHED") return null; return post; }
type PageParams = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: PageParams): Promise<Metadata> { const { slug } = await params; const post = await getPost(slug); if (!post) return {}; return { title: post.seoTitle || post.title, description: post.metaDescription || post.excerpt || undefined }; }
export default async function BlogPostPage({ params }: PageParams) { const { slug } = await params; const post = await getPost(slug); if (!post) notFound(); const paragraphs = post.body.split(/\n\s*\n/); return (<><Navbar /><main className="mx-auto max-w-2xl px-6 py-12"><p className="text-xs text-ink/50">{post.publishedAt && new Date(post.publishedAt).toDateString()}</p><h1 className="mt-1 text-3xl font-semibold">{post.title}</h1><div className="prose mt-6 space-y-4 text-ink/80">{paragraphs.map((p, i) => (<p key={i} className="leading-relaxed">{p}</p>))}</div></main></>); }
