import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2A57E8");
const safeUrl = z.string().url().refine((value) => ["https:", "http:"].includes(new URL(value).protocol), "Only http(s) asset URLs are allowed.");
const pageSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);

export const assetSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  url: safeUrl,
  alt: z.string().max(200).default(""),
});

export const sectionSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  type: z.enum(["text", "feature-grid", "image-text", "cta", "stats", "faq"]).default("text"),
  heading: z.string().max(200).default(""),
  body: z.string().max(4000).default(""),
  imageUrl: safeUrl.optional(),
  imageAlt: z.string().max(200).optional(),
  buttonLabel: z.string().max(60).optional(),
  buttonHref: z.string().max(500).optional(),
  items: z.array(z.object({ title: z.string().max(120), body: z.string().max(600) })).max(8).default([]),
});

export const pageSchema = z.object({
  slug: pageSlug,
  title: z.string().max(200),
  seoTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  noIndex: z.boolean().default(false),
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(300).optional(),
  sections: z.array(sectionSchema).max(20).default([]),
  faqs: z.array(z.object({ question: z.string().max(200), answer: z.string().max(1000) })).max(12).default([]),
  ctaLabel: z.string().max(60).optional(),
});

export const websiteContentSchema = z.object({
  template: z.enum(["MODERN", "CLASSIC", "BOLD", "MINIMAL"]).default("MODERN"),
  businessName: z.string().max(200),
  tagline: z.string().max(200).optional(),
  colors: z.object({ primary: z.string().max(20).optional(), accent: z.string().max(20).optional() }).optional(),
  brand: z.object({
    primary: color,
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14B8A6"),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0B1220"),
    logoUrl: safeUrl.optional(),
    headingFont: z.enum(["system", "serif", "rounded"]).default("system"),
    bodyFont: z.enum(["system", "serif"]).default("system"),
  }).default({}),
  navigation: z.array(z.object({ label: z.string().min(1).max(40), pageSlug })).max(10).default([]),
  assets: z.array(assetSchema).max(40).default([]),
  pages: z.array(pageSchema).min(1).max(10),
}).superRefine((content, ctx) => {
  const slugs = new Set<string>();
  content.pages.forEach((page, index) => {
    if (slugs.has(page.slug)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index, "slug"], message: "Page slugs must be unique." });
    slugs.add(page.slug);
  });
  content.navigation.forEach((item, index) => {
    if (!slugs.has(item.pageSlug)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["navigation", index, "pageSlug"], message: "Navigation must point to an existing page." });
  });
});

export type WebsiteContent = z.infer<typeof websiteContentSchema>;
export type WebsitePage = z.infer<typeof pageSchema>;
export type WebsiteSection = z.infer<typeof sectionSchema>;

export function normalizeWebsiteContent(input: unknown): WebsiteContent {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
  const legacyColors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors) ? raw.colors as Record<string, unknown> : {};
  if (!raw.brand) raw.brand = { primary: typeof legacyColors.primary === "string" && /^#[0-9a-fA-F]{6}$/.test(legacyColors.primary) ? legacyColors.primary : "#2A57E8", accent: typeof legacyColors.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(legacyColors.accent) ? legacyColors.accent : "#14B8A6" };
  if (!raw.navigation && Array.isArray(raw.pages)) raw.navigation = raw.pages.map((page: any) => ({ label: String(page?.title || page?.slug || "Page").slice(0, 40), pageSlug: String(page?.slug || "home") }));
  return websiteContentSchema.parse(raw);
}
