import { contrastColor, normalizeThemeColor } from "./business-category-domain.ts";
import type {
  BusinessCategory,
  BusinessCategoryRow,
} from "@/types/category";

export const fallbackBusinessCategory: BusinessCategory = {
  id: "uncategorized",
  name: "Products",
  slug: "uncategorized",
  description: "Enterprise products sourced and supported by SEN.",
  tagline: "Professional sourcing and support for every requirement.",
  themeColor: "#245FC8",
  foregroundColor: "#ffffff",
  icon: "◆",
  imagePath: null,
  imageUrl: null,
  active: true,
  sortOrder: 0,
  productCount: 0,
  fields: [],
};

export function toBusinessCategory(row: BusinessCategoryRow): BusinessCategory {
  const themeColor = normalizeThemeColor(row.theme_color);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    tagline: row.tagline ?? null,
    themeColor,
    foregroundColor: contrastColor(themeColor),
    icon: row.icon ?? null,
    imagePath: row.image_path ?? null,
    imageUrl: row.image_url ?? null,
    active: row.is_active ?? true,
    sortOrder: row.sort_order ?? 0,
    productCount: row.product_count ?? 0,
    fields: [...(row.business_category_fields ?? row.fields ?? [])].sort(
      (first, second) =>
        first.sort_order - second.sort_order ||
        first.label.localeCompare(second.label),
    ),
  };
}

export function categoryStyle(category: BusinessCategory) {
  return {
    "--category-color": category.themeColor,
    "--category-foreground": category.foregroundColor,
    "--theme-primary": category.themeColor,
  } as const;
}

export function catalogueTheme(
  category: BusinessCategory | null | undefined,
): BusinessCategory {
  return category ?? fallbackBusinessCategory;
}
