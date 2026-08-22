import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataSource = await readFile("lib/inventory/stock-out-data.ts", "utf8").catch(
  () => "",
);
const queueSource = await readFile(
  "app/employee/inventory/stock-out/page.tsx",
  "utf8",
).catch(() => "");
const detailSource = await readFile(
  "app/employee/inventory/stock-out/[requestId]/page.tsx",
  "utf8",
).catch(() => "");
const serialRoute = await readFile(
  "app/api/employee/inventory/stock-out/serials/route.ts",
  "utf8",
).catch(() => "");

test("queue and detail pages require the independent Stock Out permission", () => {
  assert.match(queueSource, /requirePermission\(\s*"inventory\.release_sales_stock",?\s*\)/);
  assert.match(detailSource, /requirePermission\(\s*"inventory\.release_sales_stock",?\s*\)/);
  assert.match(queueSource, /getAuthorizedStockOutQueue\(profile\.id\)/);
  assert.match(
    detailSource,
    /getAuthorizedStockOutRequest\(profile\.id,\s*requestId\)/,
  );
});

test("data access always resolves active profile and active warehouse assignments", () => {
  assert.match(dataSource, /export async function getAuthorizedStockOutQueue/);
  assert.match(dataSource, /export async function getAuthorizedStockOutRequest/);
  assert.match(dataSource, /inventory\.release_sales_stock/);
  assert.match(dataSource, /profile_warehouse_assignments/);
  assert.match(dataSource, /\.eq\("is_active",\s*true\)/);
  assert.match(dataSource, /\.is\("ended_at",\s*null\)/);
  assert.match(dataSource, /\.in\("warehouse_id",\s*warehouseIds\)/);
  assert.match(dataSource, /\.eq\("warehouse_id",\s*request\.warehouse_id\)/);
});

test("queue includes pending and partial requests but excludes completed and cancelled", () => {
  assert.match(
    dataSource,
    /\.in\("status",\s*\["pending_release",\s*"partially_released"\]\)/,
  );
  for (const field of [
    "invoiceNumber",
    "customerName",
    "requiredQuantity",
    "releasedQuantity",
    "remainingQuantity",
  ]) {
    assert.match(dataSource, new RegExp(field));
  }
  assert.match(queueSource, /Partially released|partially_released/i);
  assert.match(queueSource, /remaining/i);
});

test("detail provides current revision, packing readiness, preselected serials, and audit history", () => {
  assert.match(dataSource, /sales_stock_out_request_revisions/);
  assert.match(dataSource, /sales_stock_out_request_revision_items/);
  assert.match(dataSource, /currentSerialIdsByOrderItem/);
  assert.match(dataSource, /packed_quantity/);
  assert.match(dataSource, /sales_stock_out_releases/);
  assert.match(dataSource, /sales_stock_out_serial_changes/);
  assert.match(detailSource, /SEN Serial/i);
  assert.match(detailSource, /Release history/i);
});

test("detail preselects the current active serial allocation after an audited replacement", () => {
  assert.match(dataSource, /currentAllocationResult/);
  assert.match(dataSource, /order_serial_allocations/);
  assert.match(dataSource, /\.in\("status",\s*\["active",\s*"packed"\]\)/);
  assert.match(dataSource, /currentSerialIdsByOrderItem/);
  assert.doesNotMatch(
    dataSource,
    /preassignedSerials:\s*\(revisionItem\?\.preassigned_serial_ids\s*\?\?\s*\[\]\)/,
  );
});

test("serial search is permission scoped and returns only exact eligible warehouse units", () => {
  assert.match(serialRoute, /profile\.role\s*!==\s*"employee"/);
  assert.match(serialRoute, /inventory\.release_sales_stock/);
  assert.match(serialRoute, /requestItemId/);
  assert.match(serialRoute, /searchEligibleStockOutSerials/);
  assert.match(dataSource, /serial\.product_id\s*===\s*requestItem\.product_id/);
  assert.match(dataSource, /serial\.warehouse_id\s*===\s*request\.warehouse_id/);
  assert.match(dataSource, /\["available",\s*"reserved",\s*"allocated",\s*"packed"\]/);
  assert.match(dataSource, /\["damaged",\s*"unavailable",\s*"quarantined"/);
  assert.match(dataSource, /sales_stock_out_release_serials/);
  assert.match(dataSource, /order_serial_allocations/);
});
