export const INVENTORY_PRODUCT_SEARCH_MIN_LENGTH = 2;
export const INVENTORY_PRODUCT_SEARCH_LIMIT = 12;

export const INVENTORY_PRODUCT_SEARCH_FIELDS = [
  "name",
  "sku",
  "model_number",
  "barcode",
  "manufacturer_part_number",
] as const;

export type InventoryProductSearchField = (typeof INVENTORY_PRODUCT_SEARCH_FIELDS)[number];

export type InventoryProductSearchResult = {
  id: string;
  name: string;
  sku: string;
  model_number: string | null;
  serial_tracking_required: boolean;
};

export type InventoryVariationSearchResult = {
  id: string;
  product_id: string;
  sku: string;
  combination_key: string;
};

export function normalizeInventorySearchQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function escapeInventoryIlikePattern(value: string) {
  return normalizeInventorySearchQuery(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export function mergeInventorySearchResults<T extends { id: string }>(results: readonly T[], limit = INVENTORY_PRODUCT_SEARCH_LIMIT) {
  return [...new Map(results.map((item) => [item.id, item])).values()].slice(0, limit);
}

