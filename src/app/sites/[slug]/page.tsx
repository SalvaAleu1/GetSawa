import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { websiteContentSchema, WebsitePage } from "@/lib/ai/website-schema";
import type { Metadata } from "next";

async function getPublishedProject(slug: string) {
  const project = await prisma.websiteProject.findUnique({ where: { slug } });
  if (!project || project.status !== "PUBLISHED" || !project.content) return null;
  const parsed = websiteContentSchema.safeParse(project.content);
  if (!parsed.success) return null;
  return { project, content: parsed.data };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getPublishedProject(params.slug);
  if (!data) return {};
  const home = data.content.pages.find((p) => p.slug === "home") ?? data.content.pages[0];
  return {
    title: home?.seoTitle || data.content.businessName,
    description: home?.metaDescription || data.content.tagline,
  };
}

export default async function PublicSitePage({ params }: { params: { slug: string } }) {
  const data = await getPublishedProject(params.slug);
  if (!data) notFound();

  const { content } = data;
  const home = content.pages.find((page) => page.slug === "home") ?? content.pages[0];
  if (!home) notFound();
  const primary = content.colors?.primary || "#2A57E8";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", color: "#0B1220" }}>
      <header style={{ background: primary, color: "white", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 700, margin: 0 }}>{home.headline || content.businessName}</h1>
        {home.subheadline && <p style={{ marginTop: "1rem", fontSize: "1.125rem", opacity: 0.9 }}>{home.subheadline}</p>}
        {content.tagline && <p style={{ marginTop: "0.5rem", opacity: 0.75 }}>{content.tagline}</p>}
      </header>

      {content.pages.map((page) => (
        <section key={page.slug} id={page.slug} style={{ maxWidth: 860, margin: "0 auto", padding: "3rem 1.5rem" }}>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 600 }}>{page.title}</h2>
          {page.sections.map((s, i) => (
            <div key={i} style={{ marginTop: "1.5rem" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{s.heading}</h3>
              <p style={{ marginTop: "0.5rem", color: "#4B5563", lineHeight: 1.7 }}>{s.body}</p>
            </div>
          ))}
          {page.faqs.length > 0 && (
            <div style={{ marginTop: "2rem" }}>
              {page.faqs.map((f, i) => (
                <div key={i} style={{ marginTop: "1rem" }}>
                  <p style={{ fontWeight: 600 }}>{f.question}</p>
                  <p style={{ color: "#4B5563" }}>{f.answer}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <footer style={{ textAlign: "center", padding: "2rem", color: "#9CA3AF", fontSize: "0.875rem" }}>
        Built with GetSawa AI Website Builder
      </footer>
    </main>
  );
}
