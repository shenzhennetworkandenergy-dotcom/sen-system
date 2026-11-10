type FooterCategory = {
  name: string;
  slug: string;
};

export type FooterProductLink = {
  label: string;
  href: string;
};

const fallbackProductLinks: readonly FooterProductLink[] = [
  { label: "All products", href: "/products" },
];

export async function loadFooterProductLinks(
  loadCategories: () => Promise<readonly FooterCategory[]>,
): Promise<FooterProductLink[]> {
  try {
    const categories = await loadCategories();
    if (!categories.length) return [...fallbackProductLinks];

    return categories.map((category) => ({
      label: category.name,
      href: `/products?category=${encodeURIComponent(category.slug)}`,
    }));
  } catch {
    return [...fallbackProductLinks];
  }
}
