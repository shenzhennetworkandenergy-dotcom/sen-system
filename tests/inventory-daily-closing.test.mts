import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aggregateDailyClosing,
  getDailyClosingDateRange,
  DAILY_CLOSING_PERMISSION_KEYS,
} from "../lib/inventory/daily-closing.ts";

test("computes a complete Asia/Dhaka business-day UTC range", () => {
  assert.deepEqual(getDailyClosingDateRange("2026-08-21"), {
    start: "2026-08-20T18:00:00.000Z",
    end: "2026-08-21T18:00:00.000Z",
  });
});

test("aggregates opening, in, out and closing quantities for one warehouse", () => {
  const result = aggregateDailyClosing({
    inventoryDate: "2026-08-21",
    warehouseId: "w-a",
    includeAllProducts: false,
    balances: [{ productId: "p-1", variationId: null, warehouseId: "w-a", onHand: 12, productName: "Router", sku: "R-1", model: "M1" }],
    movements: [
      { id: "old-in", reference: "OLD", movementType: "purchase_receipt", status: "confirmed", transactionAt: "2026-08-20T17:00:00.000Z", itemId: "i-old", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: 5, productName: "Router", sku: "R-1", model: "M1" },
      { id: "today-in", reference: "IN", movementType: "purchase_receipt", status: "confirmed", transactionAt: "2026-08-21T03:00:00.000Z", itemId: "i-in", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: 4, productName: "Router", sku: "R-1", model: "M1" },
      { id: "today-out", reference: "OUT", movementType: "sale_allocation", status: "confirmed", transactionAt: "2026-08-21T05:00:00.000Z", itemId: "i-out", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: -2, productName: "Router", sku: "R-1", model: "M1" },
      { id: "later-out", reference: "LATER", movementType: "damage", status: "confirmed", transactionAt: "2026-08-21T19:00:00.000Z", itemId: "i-later", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: -1, productName: "Router", sku: "R-1", model: "M1" },
    ],
  });
  assert.deepEqual(result.rows.map(({ openingQty, stockIn, stockOut, closingQty }) => ({ openingQty, stockIn, stockOut, closingQty })), [{ openingQty: 11, stockIn: 4, stockOut: 2, closingQty: 13 }]);
  assert.equal(result.summary.totalStockIn, 4);
  assert.equal(result.summary.totalStockOut, 2);
  assert.equal(result.summary.totalClosingQty, 13);
});

test("nets internal transfers in the all-warehouse report", () => {
  const result = aggregateDailyClosing({
    inventoryDate: "2026-08-21",
    warehouseId: null,
    includeAllProducts: false,
    balances: [{ productId: "p-1", variationId: null, warehouseId: "w-a", onHand: 5, productName: "Cable", sku: "C-1", model: "M1" }, { productId: "p-1", variationId: null, warehouseId: "w-b", onHand: 5, productName: "Cable", sku: "C-1", model: "M1" }],
    movements: [
      { id: "transfer", reference: "TRF", movementType: "warehouse_transfer", status: "confirmed", transactionAt: "2026-08-21T02:00:00.000Z", itemId: "i-a", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: -3, sourceWarehouseId: "w-a", destinationWarehouseId: "w-b", productName: "Cable", sku: "C-1", model: "M1" },
      { id: "transfer", reference: "TRF", movementType: "warehouse_transfer", status: "confirmed", transactionAt: "2026-08-21T02:00:00.000Z", itemId: "i-b", productId: "p-1", variationId: null, warehouseId: "w-b", quantityDelta: 3, sourceWarehouseId: "w-a", destinationWarehouseId: "w-b", productName: "Cable", sku: "C-1", model: "M1" },
    ],
  });
  assert.equal(result.rows[0]?.stockIn, 3);
  assert.equal(result.rows[0]?.stockOut, 3);
  assert.equal(result.rows[0]?.closingQty, 10);
  assert.equal(result.rows[0]?.reconciliationNeeded, false);
});

test("counts a confirmed Stock Out movement once at its physical release time", () => {
  const result = aggregateDailyClosing({
    inventoryDate: "2026-08-21",
    warehouseId: "w-a",
    includeAllProducts: false,
    balances: [{ productId: "p-1", variationId: null, warehouseId: "w-a", onHand: 7, productName: "Switch", sku: "SW-1", model: "S1" }],
    movements: [{ id: "stock-out", reference: "STO-1", movementType: "stock_out", status: "confirmed", transactionAt: "2026-08-21T05:00:00.000Z", itemId: "line-1", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: -3, balanceAfter: 7, productName: "Switch", sku: "SW-1", model: "S1" }],
  });

  assert.deepEqual(
    result.rows.map(({ openingQty, stockIn, stockOut, closingQty }) => ({ openingQty, stockIn, stockOut, closingQty })),
    [{ openingQty: 10, stockIn: 0, stockOut: 3, closingQty: 7 }],
  );
  assert.equal(result.summary.totalStockOut, 3);
  assert.equal(result.summary.stockOutTransactions, 1);
});

test("includes no-activity products only when requested and flags reconciliation", () => {
  const result = aggregateDailyClosing({
    inventoryDate: "2026-08-21",
    warehouseId: "w-a",
    includeAllProducts: true,
    balances: [{ productId: "p-1", variationId: null, warehouseId: "w-a", onHand: 8, productName: "Stocked", sku: "S-1", model: null }, { productId: "p-2", variationId: null, warehouseId: "w-a", onHand: 2, productName: "Quiet", sku: "Q-1", model: null }],
    movements: [{ id: "m", reference: "M", movementType: "correction", status: "confirmed", transactionAt: "2026-08-21T02:00:00.000Z", itemId: "i", productId: "p-1", variationId: null, warehouseId: "w-a", quantityDelta: 1, balanceAfter: 7, productName: "Stocked", sku: "S-1", model: null }],
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find((row) => row.productId === "p-2")?.stockIn, 0);
  assert.equal(result.rows.find((row) => row.productId === "p-1")?.reconciliationNeeded, true);
});

test("exposes the seven daily-closing permission keys", () => {
  assert.deepEqual(DAILY_CLOSING_PERMISSION_KEYS, [
    "inventory.daily_closing_view",
    "inventory.daily_closing_generate",
    "inventory.daily_closing_finalize",
    "inventory.daily_closing_print",
    "inventory.daily_closing_verify",
    "inventory.daily_closing_view_history",
    "inventory.daily_closing_export_pdf",
  ]);
});

test("uses an additive migration and a protected A4 print route", async () => {
  const [migration, printPage, report, printStyles, inventoryPage] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608210002_inventory_daily_closing.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/daily-closing/[id]/print/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/inventory/DailyClosingReport.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/inventory/daily-closing-print.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const table of ["inventory_daily_closing_sheets", "inventory_daily_closing_lines", "inventory_daily_closing_movement_details"]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  for (const permission of DAILY_CLOSING_PERMISSION_KEYS) assert.match(migration, new RegExp(permission.replaceAll(".", "\\.")));
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from|update public\.inventory_(?:balances|movements|movement_items|serial_numbers))\b/i);
  assert.match(printPage, /requirePermission\("inventory\.daily_closing_print"\)/);
  assert.match(report, /DAILY_CLOSING_PRINT_STYLES/);
  assert.match(printStyles, /@page\s*{[\s\S]*?size:\s*A4 landscape/);
  assert.match(printStyles, /display:\s*table-header-group/);
  assert.match(inventoryPage, /Daily Inventory Closing Sheet/);
});

test("daily closing print flow exposes a print-hidden system print action", async () => {
  const [dailyClosingPage, printPage, printButton] = await Promise.all([
    readFile(new URL("../app/admin/inventory/daily-closing/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/daily-closing/[id]/print/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/inventory/DailyClosingPrintButton.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dailyClosingPage, />Print Inventory Sheet<\/button>/);
  assert.match(printPage, /<DailyClosingSystemPrintButton\s*\/>/);
  assert.match(printButton, /export function DailyClosingSystemPrintButton/);
  assert.match(printButton, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(printButton, /print:hidden/);
  assert.match(printButton, />Print<\/button>/);
});
