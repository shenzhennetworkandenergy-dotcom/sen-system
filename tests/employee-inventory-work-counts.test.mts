import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const countsModule = await import(
  "../lib/inventory/employee-inventory-work-counts.ts"
).catch(() => null);
const shellSource = await readFile("components/dashboard/Shell.tsx", "utf8");
const navigationSource = await readFile(
  "components/dashboard/DashboardNavigation.tsx",
  "utf8",
);
const routeSource = await readFile(
  "app/api/employee/inventory/work-counts/route.ts",
  "utf8",
).catch(() => "");

const purchaseOrders = [
  {
    id: "po-a",
    destination_warehouse_id: "warehouse-a",
    status: "received",
    purchase_order_items: [
      { quantity_ordered: 10, quantity_received: 2, quantity_rejected: 0 },
      { quantity_ordered: 5, quantity_received: 0, quantity_rejected: 0 },
    ],
  },
  {
    id: "po-b",
    destination_warehouse_id: "warehouse-b",
    status: "partially_received",
    purchase_order_items: [
      { quantity_ordered: 1, quantity_received: 1, quantity_rejected: 0 },
    ],
  },
  {
    id: "po-c",
    destination_warehouse_id: "warehouse-c",
    status: "received",
    purchase_order_items: [
      { quantity_ordered: 4, quantity_received: 0, quantity_rejected: 0 },
    ],
  },
];

const stockOutRequests = [
  { id: "request-a", warehouse_id: "warehouse-a", status: "pending_release" },
  { id: "request-a", warehouse_id: "warehouse-a", status: "pending_release" },
  { id: "request-b", warehouse_id: "warehouse-b", status: "partially_released" },
  { id: "request-c", warehouse_id: "warehouse-a", status: "fully_released" },
  { id: "request-d", warehouse_id: "warehouse-c", status: "pending_release" },
];

test("badges count pending requests, not product units, within authorized warehouses", () => {
  assert.ok(countsModule, "Employee inventory work-count helpers must exist.");
  if (!countsModule) return;

  assert.deepEqual(
    countsModule.buildEmployeeInventoryWorkCounts({
      permissions: new Set([
        "inventory.receive_new_stock",
        "inventory.release_sales_stock",
      ]),
      warehouseIds: ["warehouse-a", "warehouse-b"],
      purchaseOrders,
      stockOutRequests,
    }),
    { "receive-new-stock": 1, "stock-out-product-release": 2 },
  );
});

test("zero and unauthorized counts are omitted", () => {
  assert.ok(countsModule, "Employee inventory work-count helpers must exist.");
  if (!countsModule) return;

  assert.deepEqual(
    countsModule.buildEmployeeInventoryWorkCounts({
      permissions: new Set(["inventory.receive_new_stock"]),
      warehouseIds: ["warehouse-b"],
      purchaseOrders,
      stockOutRequests,
    }),
    {},
  );
  assert.deepEqual(
    countsModule.buildEmployeeInventoryWorkCounts({
      permissions: new Set(),
      warehouseIds: ["warehouse-a"],
      purchaseOrders,
      stockOutRequests,
    }),
    {},
  );
});

test("employee shell and API use the same scoped count source", () => {
  assert.match(shellSource, /getEmployeeInventoryWorkCounts/);
  assert.match(shellSource, /workCountsEndpoint=/);
  assert.match(routeSource, /getEmployeeInventoryWorkCounts/);
  assert.match(routeSource, /profile\.role\s*!==\s*"employee"/);
  assert.match(routeSource, /profile\.status\s*!==\s*"active"/);
});

test("client badges poll only while visible and preserve the last successful response", () => {
  assert.match(navigationSource, /workCountsEndpoint\?:\s*string/);
  assert.match(navigationSource, /30_000/);
  assert.match(navigationSource, /document\.visibilityState\s*===\s*"visible"/);
  assert.match(navigationSource, /visibilitychange/);
  assert.match(navigationSource, /response\.ok/);
  assert.doesNotMatch(navigationSource, /catch[\s\S]{0,100}setLiveWorkCounts\(\{\}\)/);
});
