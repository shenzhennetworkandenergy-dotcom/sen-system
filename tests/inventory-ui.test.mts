import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("app/admin/inventory/page.tsx", "utf8");

const expectedLinks = [
  ["Generate serials", "/admin/serials/generate"],
  ["Add serialized stock", "/admin/serials/generate"],
  ["Scan serial", "/admin/serials/scan"],
  ["Search serials", "/admin/serials"],
  ["Print labels", "/admin/serials/print"],
  ["Reprint labels", "/admin/serials/print"],
  ["Regenerate eligible serials", "/admin/serials/regenerate"],
  ["View all serials", "/admin/serials"],
  ["View generation batches", "/admin/serials/batches"],
  ["Export serials", "/admin/serials/export"],
  ["Add product", "/admin/products/new"],
  ["Add stock", "/admin/inventory/adjustments/new"],
  ["Add category", "/admin/categories"],
  ["Add brand", "/admin/brands"],
  ["Manage attributes", "/admin/attributes"],
  ["Transfer stock", "/admin/inventory/adjustments/new"],
  ["Manage warehouses", "/admin/warehouses"],
  ["Daily Inventory Closing Sheet", "/admin/inventory/daily-closing"],
];

const metrics = [
  "active_products",
  "simple_products",
  "variable_products",
  "variations",
  "on_hand",
  "available",
  "reserved",
  "low_stock",
  "out_of_stock",
  "serialized_units",
];

test("Inventory UI keeps every existing action and adds scoped visual zones", () => {
  for (const [label, route] of expectedLinks) {
    assert.ok(source.includes(label), `missing Inventory action label: ${label}`);
    assert.ok(source.includes(route), `missing Inventory action route: ${route}`);
  }
  for (const metric of metrics) {
    assert.ok(source.includes(`"${metric}"`), `missing Inventory metric: ${metric}`);
  }
  assert.ok(source.includes("/admin/inventory/details?metric=${metric}"));
  for (const guard of [
    'requirePermission("inventory.view")',
    "getInventorySummary(profile.id)",
    '.from("inventory_movements")',
    '.order("created_at", { ascending: false })',
    ".limit(8)",
    'permissions.has("inventory.daily_closing_view")',
    'permissions.has("inventory.daily_closing_generate")',
  ]) {
    assert.ok(source.includes(guard), `missing preserved Inventory guard: ${guard}`);
  }
  for (const zone of ["serial-operations", "quick-actions", "summary-metrics", "warehouse-stock", "stock-movements"]) {
    assert.ok(source.includes(`data-inventory-zone="${zone}"`), `missing visual zone: ${zone}`);
  }
  assert.ok(source.includes("function InventoryIcon"));
});
