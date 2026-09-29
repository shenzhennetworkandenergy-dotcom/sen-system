import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { getBusinessCategories } from "@/lib/catalog/business-categories";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const siteUrl = "https://sen.com.bd";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ data: products }, businessCategories] = await Promise.all([
    createSupabaseAdminClient()
      .from("products")
      .select("slug,updated_at")
      .eq("status", "active")
      .eq("public_catalogue_visible", true)
      .order("updated_at", { ascending: false })
      .limit(5000),
    getBusinessCategories(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/contact`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/solutions`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/request-quote/general`, changeFrequency: "monthly", priority: 0.7 },
    ...businessCategories.map((category) => ({
      url: `${siteUrl}/products?category=${encodeURIComponent(category.slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...siteConfig.solutionAreas.map((solution) => ({
      url: `${siteUrl}${solution.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [
    ...staticPages,
    ...(products ?? []).map((product) => ({
      url: `${siteUrl}/products/${product.slug}`,
      lastModified: product.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
