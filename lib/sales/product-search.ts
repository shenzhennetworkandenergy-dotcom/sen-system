export type SaleSearchProduct = {
  id: string;
  name: string;
  sku: string;
  model_number: string | null;
  search_terms?: string | null;
};

export function filterSaleProducts<T extends SaleSearchProduct>(
  products: readonly T[],
  query: string,
  limit = 10,
): T[] {
  const searchText = query.trim().toLocaleLowerCase();

  if (!searchText) {
    return [];
  }

  return products
    .filter((product) =>
      [
        product.name,
        product.sku,
        product.model_number ?? "",
        product.search_terms ?? "",
      ]
        .some((value) => value.toLocaleLowerCase().includes(searchText)),
    )
    .slice(0, limit);
}
