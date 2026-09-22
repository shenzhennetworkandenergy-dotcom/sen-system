import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  INVENTORY_PRODUCT_SEARCH_LIMIT,
  INVENTORY_PRODUCT_SEARCH_MIN_LENGTH,
  escapeInventoryIlikePattern,
  mergeInventorySearchResults,
  normalizeInventorySearchQuery,
  type InventoryProductSearchResult,
} from "../lib/inventory/product-search.ts";

const routeSource = await readFile("app/api/admin/inventory/product-search/route.ts", "utf8");
const searchHelperSource = await readFile("lib/inventory/product-search.ts", "utf8");
const pickerSource = await readFile("components/inventory/InventoryProductTypeahead.tsx", "utf8");
const generateSource = await readFile("app/admin/serials/generate/page.tsx", "utf8");
const adjustmentsSource = await readFile("app/admin/inventory/adjustments/new/page.tsx", "utf8");
const serialsSource = await readFile("app/admin/serials/page.tsx", "utf8");
const inventoryDataSource = await readFile("lib/inventory/data.ts", "utf8");
const inventoryActionsSource = await readFile("app/admin/inventory/actions.ts", "utf8");
const foundationSource = await readFile("supabase/migrations/202607200004_inventory_integrity_hardening.sql", "utf8");

test("normalizes a bounded search query without dropping model punctuation", () => {
  assert.equal(normalizeInventorySearchQuery("  Dell  R740/2U  "), "Dell R740/2U");
  assert.equal(normalizeInventorySearchQuery("a".repeat(120)).length, 80);
});

test("escapes ILIKE wildcard input so special characters cannot broaden the search", () => {
  assert.equal(escapeInventoryIlikePattern("50%_rack"), "50\\%\\_rack");
});

test("keeps product search results unique and limited for large catalogues", () => {
  const products: InventoryProductSearchResult[] = Array.from({ length: 5000 }, (_, index) => ({
    id: `product-${index}`,
    name: `Product ${index}`,
    sku: `SKU-${index}`,
    model_number: index % 2 ? null : `MODEL-${index}`,
    serial_tracking_required: index % 3 === 0,
  }));
  const merged = mergeInventorySearchResults([...products, products[0]], INVENTORY_PRODUCT_SEARCH_LIMIT);
  assert.equal(merged.length, INVENTORY_PRODUCT_SEARCH_LIMIT);
  assert.equal(new Set(merged.map((item) => item.id)).size, merged.length);
});

test("requires the minimum query length used by the server search contract", () => {
  assert.equal(INVENTORY_PRODUCT_SEARCH_MIN_LENGTH, 2);
  assert.equal(normalizeInventorySearchQuery(" ").length < INVENTORY_PRODUCT_SEARCH_MIN_LENGTH, true);
  assert.equal(normalizeInventorySearchQuery("A").length < INVENTORY_PRODUCT_SEARCH_MIN_LENGTH, true);
});

test("the protected endpoint maps each workflow to its existing permission", () => {
  for (const permission of [
    "serials.generate",
    "serials.view",
    "inventory.adjust_stock",
    "inventory.transfer",
  ]) {
    assert.match(routeSource, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(routeSource, /requirePermission/);
  assert.match(routeSource, /scope/);
  assert.match(routeSource, /kind/);
});

test("the endpoint searches only approved identity fields and returns a bounded result", () => {
  for (const field of ["name", "sku", "model_number", "barcode", "manufacturer_part_number"]) {
    assert.match(`${routeSource}\n${searchHelperSource}`, new RegExp(field));
  }
  assert.match(routeSource, /serial_tracking_required/);
  assert.match(routeSource, /INVENTORY_PRODUCT_SEARCH_LIMIT/);
  assert.doesNotMatch(routeSource, /api\/products\/search/);
  assert.doesNotMatch(routeSource, /purchase_cost|sale_price|inventory_balances/);
});

test("the picker implements debounced cancellation and keyboard combobox behavior", () => {
  for (const fragment of [
    "AbortController",
    "setTimeout",
    "ArrowDown",
    "ArrowUp",
    "Enter",
    "Escape",
    'role="combobox"',
    'role="listbox"',
    'role="option"',
    "aria-activedescendant",
    "No matching products found",
    "Clear selection",
  ]) {
    assert.match(pickerSource, new RegExp(fragment.replace(/["/]/g, "\\$&")), `missing picker behavior: ${fragment}`);
  }
  assert.match(pickerSource, /220|200|250/);
});

test("serial generation uses the protected picker and keeps its existing redirect workflow", () => {
  assert.match(generateSource, /InventoryProductTypeahead/);
  assert.match(generateSource, /serial-generate/);
  assert.match(generateSource, /\/admin\/products\/\$\{params\.product\}\/stock\/add/);
  assert.doesNotMatch(generateSource, /\.limit\(500\)/);
  assert.doesNotMatch(generateSource, /<select[^>]+name="product"/);
});

test("adjustment and transfer forms use product-scoped searchable fields", () => {
  assert.match(adjustmentsSource, /InventoryProductFields/);
  assert.match(adjustmentsSource, /scope="adjust"/);
  assert.match(adjustmentsSource, /scope="transfer"/);
  assert.doesNotMatch(adjustmentsSource, /\.limit\(500\)/);
  assert.doesNotMatch(adjustmentsSource, /\.limit\(1000\)/);
  assert.match(inventoryDataSource, /product_id/);
  assert.match(inventoryActionsSource, /requested_product_id/);
  assert.match(inventoryActionsSource, /requested_variation_id/);
});

test("serial list keeps exact product query filtering while replacing only the selector", () => {
  assert.match(serialsSource, /InventoryProductTypeahead/);
  assert.match(serialsSource, /name="product"/);
  assert.match(serialsSource, /params\.product/);
  assert.match(serialsSource, /eq\("product_id", params\.product\)/);
  assert.doesNotMatch(serialsSource, /\.limit\(500\)/);
});

test("existing database RPCs continue rejecting a variation from another product", () => {
  assert.match(foundationSource, /Invalid variation for product/);
  assert.match(foundationSource, /product_id=requested_product_id/);
});

test("variation search is product-scoped and excludes inactive variations", () => {
  assert.match(routeSource, /product_variations/);
  assert.match(routeSource, /eq\("product_id", productId\)/);
  assert.match(routeSource, /eq\("status", "active"\)/);
  assert.match(routeSource, /product_id/);
  assert.match(routeSource, /combination_key/);
});

test("serial generation applies its eligibility rule on the server", () => {
  assert.match(routeSource, /scope === "serial-generate"/);
  assert.match(routeSource, /eq\("serial_tracking_required", true\)/);
  assert.match(generateSource, /serials\.generate/);
});

test("the component preserves hidden server-action identifiers", () => {
  assert.match(pickerSource, /name=\{name\}/);
  assert.match(pickerSource, /product_id/);
  assert.match(pickerSource, /variation_id/);
  assert.match(pickerSource, /product_id/);
});

test("serial list preserves existing pagination and serial text filters", () => {
  assert.match(serialsSource, /range\(\(page - 1\) \* size, page \* size - 1\)/);
  assert.match(serialsSource, /manufacturer_serial\.ilike/);
  assert.match(serialsSource, /sen_serial\.ilike/);
  assert.match(serialsSource, /barcode_value\.ilike/);
  assert.match(serialsSource, /eq\("status", params\.status\)/);
  assert.match(serialsSource, /eq\("warehouse_id", params\.warehouse\)/);
});

test("the adjustment data loader no longer preloads the catalogue or global variations", () => {
  const selectorSource = inventoryDataSource.slice(0, inventoryDataSource.indexOf("export const inventoryMetrics"));
  assert.doesNotMatch(selectorSource, /products"\).*limit\(500\)/);
  assert.doesNotMatch(selectorSource, /product_variations/);
  assert.match(selectorSource, /in\("id", productIds\)/);
});
