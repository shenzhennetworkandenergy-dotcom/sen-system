export type PublicProductEqualityFilter =
  | { column: "status"; value: "active" }
  | { column: "public_catalogue_visible"; value: true }
  | { column: "featured"; value: true };

export function publicProductEqualityFilters(
  featuredOnly: boolean,
): PublicProductEqualityFilter[] {
  const filters: PublicProductEqualityFilter[] = [
    { column: "status", value: "active" },
    { column: "public_catalogue_visible", value: true },
  ];
  if (featuredOnly) filters.push({ column: "featured", value: true });
  return filters;
}

export async function collectAllProductBatches<T>(
  fetchBatch: (from: number, to: number) => Promise<T[]>,
  batchSize = 500,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Product batch size must be a positive integer.");
  }

  const products: T[] = [];
  for (let from = 0; ; from += batchSize) {
    const batch = await fetchBatch(from, from + batchSize - 1);
    products.push(...batch);
    if (batch.length < batchSize) return products;
  }
}

export async function collectRowsByProductIds<T>(
  productIds: readonly string[],
  fetchBatch: (productIds: readonly string[], from: number, to: number) => Promise<T[]>,
  options: { idBatchSize?: number; rowBatchSize?: number } = {},
) {
  const idBatchSize = options.idBatchSize ?? 100;
  const rowBatchSize = options.rowBatchSize ?? 500;
  if (!Number.isInteger(idBatchSize) || idBatchSize < 1) {
    throw new Error("Product ID batch size must be a positive integer.");
  }

  const rows: T[] = [];
  for (let index = 0; index < productIds.length; index += idBatchSize) {
    const idBatch = productIds.slice(index, index + idBatchSize);
    rows.push(
      ...(await collectAllProductBatches(
        (from, to) => fetchBatch(idBatch, from, to),
        rowBatchSize,
      )),
    );
  }
  return rows;
}

export type PublicProductOrder = {
  column: "sale_price" | "name" | "featured" | "updated_at" | "id";
  ascending: boolean;
  nullsFirst?: boolean;
};

export function publicProductOrder(sort?: string): PublicProductOrder[] {
  if (sort === "price_low") {
    return [
      { column: "sale_price", ascending: true, nullsFirst: false },
      { column: "id", ascending: true },
    ];
  }
  if (sort === "name") {
    return [
      { column: "name", ascending: true },
      { column: "id", ascending: true },
    ];
  }
  return [
    { column: "featured", ascending: false },
    { column: "updated_at", ascending: false },
    { column: "id", ascending: true },
  ];
}
