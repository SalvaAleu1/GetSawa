import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "https://getsawa.app";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
