import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshot } from "@/lib/website-editor";
import { WebsiteRenderer } from "@/components/websites/WebsiteRenderer";

async function resolveHost(host: string, path: string[]) {
  const hostname = decodeURIComponent(host).toLowerCase();
  const rows = await prisma.$queryRaw<Array<{ project_id: string; project_status: string }>>`
    SELECT wcd."project_id",wp."status" AS project_status
    FROM "website_custom_domains" wcd JOIN "WebsiteProject" wp ON wp."id"=wcd."project_id"
    WHERE wcd."hostname"=${hostname} AND wcd."status"='ACTIVE' LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.project_status !== "PUBLISHED") return null;
  const cleanPath = `/${path.join("/")}`.replace(/\/{2,}/g, "/");
  const redirects = await prisma.$queryRaw<Array<{ target_path: string; status_code: number }>>`
    SELECT "target_path","status_code" FROM "website_redirects" WHERE "project_id"=${row.project_id} AND "source_path"=${cleanPath || "/"} AND "enabled"=TRUE LIMIT 1
  `;
  if (redirects[0]) return { redirectTo: redirects[0].target_path, statusCode: redirects[0].status_code, projectId: row.project_id, content: null };
  const snapshot = await getPublishedSnapshot(row.project_id);
  if (!snapshot) return null;
  return { redirectTo: null, statusCode: null, projectId: row.project_id, content: snapshot.content };
}

type Params = { params: Promise<{ host: string; path?: string[] }> };
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { host, path = [] } = await params; const resolved = await resolveHost(host, path); if (!resolved?.content) return {};
  const slug = path[0] || "home"; const page = resolved.content.pages.find((candidate) => candidate.slug === slug) ?? resolved.content.pages.find((candidate) => candidate.slug === "home") ?? resolved.content.pages[0];
  return { title: page?.seoTitle || resolved.content.businessName, description: page?.metaDescription || resolved.content.tagline, robots: page?.noIndex ? { index: false, follow: true } : undefined };
}
export default async function CustomHostSite({ params }: Params) {
  const { host, path = [] } = await params; const resolved = await resolveHost(host, path); if (!resolved) notFound();
  if (resolved.redirectTo) { if (resolved.statusCode === 308 || resolved.statusCode === 301) permanentRedirect(resolved.redirectTo); redirect(resolved.redirectTo); }
  if (!resolved.content) notFound(); const pageSlug = path[0] || "home"; if (!resolved.content.pages.some((page) => page.slug === pageSlug) && pageSlug !== "home") notFound();
  return <WebsiteRenderer content={resolved.content} pageSlug={pageSlug} basePath="" />;
}
