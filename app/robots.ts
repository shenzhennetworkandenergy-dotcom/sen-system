import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/employee/",
        "/account/",
        "/api/",
        "/environment-check",
      ],
    },
    sitemap: "https://sen.com.bd/sitemap.xml",
    host: "https://sen.com.bd",
  };
}
