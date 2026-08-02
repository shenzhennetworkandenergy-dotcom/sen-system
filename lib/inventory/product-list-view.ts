export type ProductListImage = {
  product_id: string;
  is_primary: boolean;
  sort_order: number;
};

export type ProductListParams = {
  q?: string;
  category?: string;
  brand?: string;
  type?: string;
  stock?: string;
  status?: string;
  featured?: string;
  sort?: string;
  page?: string;
};

export const featuredFilterOptions = [
  { value: "", label: "All featured states" },
  { value: "featured", label: "Featured only" },
  { value: "not_featured", label: "Not featured" },
] as const;

export function normalizeFeaturedFilter(value?: string): boolean | null {
  if (value === "featured") return true;
  if (value === "not_featured") return false;
  return null;
}

export function productListPageHref(params: ProductListParams, page: number) {
  const search = new URLSearchParams();
  for (const key of [
    "q",
    "category",
    "brand",
    "type",
    "stock",
    "status",
    "featured",
    "sort",
  ] as const) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  search.set("page", String(Math.max(1, page)));
  return `?${search.toString()}`;
}

export function pickProductListImage<T extends ProductListImage>(
  images: readonly T[],
  productId: string,
): T | null {
  return (
    images
      .filter((image) => image.product_id === productId)
      .toSorted((left, right) => {
        if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1;
        return left.sort_order - right.sort_order;
      })[0] ?? null
  );
}
