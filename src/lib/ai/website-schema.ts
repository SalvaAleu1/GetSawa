import { z } from "zod";

/**
 * Structured content for an AI-generated website. Kept as data (not HTML)
 * so it can be edited safely in the dashboard editor and rendered by a
 * fixed set of trusted templates — the AI never generates raw HTML/JS that
 * gets executed, which would be an XSS risk.
 */

export const sectionSchema = z.object({
  heading: z.string().max(200),
  body: z.string().max(2000),
});

export const pageSchema = z.object({
  slug: z.string().max(50), // "home", "about", "services", "contact", ...
  title: z.string().max(200),
  seoTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(300).optional(),
  sections: z.array(sectionSchema).max(12).default([]),
  faqs: z.array(z.object({ question: z.string().max(200), answer: z.string().max(1000) })).max(10).default([]),
  ctaLabel: z.string().max(60).optional(),
});

export const websiteContentSchema = z.object({
  businessName: z.string().max(200),
  tagline: z.string().max(200).optional(),
  colors: z.object({ primary: z.string().max(20).optional(), accent: z.string().max(20).optional() }).optional(),
  pages: z.array(pageSchema).min(1).max(10),
});

export type WebsiteContent = z.infer<typeof websiteContentSchema>;
export type WebsitePage = z.infer<typeof pageSchema>;
