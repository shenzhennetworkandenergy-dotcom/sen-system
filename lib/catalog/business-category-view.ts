import type { BusinessCategory } from "../../types/category.ts";

export function publicCategoryHref(category: BusinessCategory) {
  return `/products?category=${encodeURIComponent(category.slug)}`;
}

export function publicBusinessCategoryCards(
  categories: BusinessCategory[],
) {
  return categories
    .filter((category) => category.active)
    .sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.name.localeCompare(second.name),
    )
    .map((category) => ({
      ...category,
      href: publicCategoryHref(category),
    }));
}

export function resolvePublicCategory(
  categories: BusinessCategory[],
  identifier: string | null | undefined,
) {
  const normalized = identifier?.trim().toLowerCase();
  if (!normalized) return null;
  return (
    categories.find(
      (category) =>
        category.id.toLowerCase() === normalized ||
        category.slug.toLowerCase() === normalized ||
        category.name.toLowerCase() === normalized,
    ) ?? null
  );
}

