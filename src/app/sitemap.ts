import type { MetadataRoute } from "next";

const baseUrl = (process.env.APP_URL || "https://getsawa.app").replace(/\/$/, "");

const publicRoutes = [
  "/",
  "/domains",
  "/products",
  "/products/security",
  "/blog",
  "/developers",
  "/support",
  "/legal/privacy",
  "/legal/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/domains" || path === "/products" ? 0.9 : 0.6,
  }));
}
