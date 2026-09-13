import type { MetadataRoute } from "next";

const baseUrl = process.env.APP_URL || "https://getsawa.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/checkout/",
        "/dashboard/",
        "/login",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
    host: baseUrl,
  };
}
