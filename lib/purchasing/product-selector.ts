export type SelectablePurchaseProduct = { id: string; name: string; sku: string };

export function matchingPurchaseProducts<T extends SelectablePurchaseProduct>(products: readonly T[], query: string): T[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const matches: T[] = [];
  for (const product of products) {
    if (product.name.toLocaleLowerCase().includes(term) || product.sku.toLocaleLowerCase().includes(term)) {
      matches.push(product);
      if (matches.length === 12) break;
    }
  }
  return matches;
}
