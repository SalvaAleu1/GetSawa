import type { MetadataRoute } from "next";
import { getCloudSawaPublicUrl } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  const publicUrl = getCloudSawaPublicUrl();

  if (!publicUrl) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

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
    sitemap: `${publicUrl}/sitemap.xml`,
    host: publicUrl,
  };
}
