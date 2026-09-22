import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as dailyClosing from "../lib/inventory/daily-closing.ts";

type GenerationOptions = {
  date: string;
  warehouseId: string | null;
  includeAllProducts: boolean;
  includeSerialDetails: boolean;
  movementOnly?: boolean;
};

type EmployeeScope = {
  inventoryDate: string;
  warehouseId: string;
};

type DailyClosingPolicyModule = {
  constrainDailyClosingGeneration?: (
    role: string,
    submitted: GenerationOptions,
    employeeScope: EmployeeScope | null,
  ) => GenerationOptions;
  canAccessDailyClosingSheet?: (
    role: string,
    sheet: { inventoryDate: string; warehouseId: string | null },
    employeeScope: EmployeeScope | null,
  ) => boolean;
  canUseDailyClosingAdminWorkflow?: (role: string) => boolean;
  canEmployeeAccessDailyClosingPage?: (permissions: Iterable<string>) => boolean;
};

const policy = dailyClosing as DailyClosingPolicyModule;

test("employee generation ignores tampered date, warehouse, and visibility options", () => {
  assert.equal(typeof policy.constrainDailyClosingGeneration, "function");
  const result = policy.constrainDailyClosingGeneration!(
    "employee",
    {
      date: "2026-01-01",
      warehouseId: "attacker-selected-warehouse",
      includeAllProducts: true,
      includeSerialDetails: true,
    },
    { inventoryDate: "2026-08-22", warehouseId: "assigned-warehouse" },
  );

  assert.deepEqual(result, {
    date: "2026-08-22",
    warehouseId: "assigned-warehouse",
    includeAllProducts: false,
    includeSerialDetails: false,
    movementOnly: true,
  });
});

test("employee generation requires an active primary warehouse assignment", () => {
  assert.equal(typeof policy.constrainDailyClosingGeneration, "function");
  assert.throws(
    () => policy.constrainDailyClosingGeneration!(
      "employee",
      {
        date: "2026-08-22",
        warehouseId: null,
        includeAllProducts: false,
        includeSerialDetails: false,
      },
      null,
    ),
    /active primary warehouse assignment/i,
  );
});

test("admin generation options remain exactly user-selected", () => {
  assert.equal(typeof policy.constrainDailyClosingGeneration, "function");
  const submitted = {
    date: "2026-08-20",
    warehouseId: null,
    includeAllProducts: true,
    includeSerialDetails: true,
  };

  assert.deepEqual(policy.constrainDailyClosingGeneration!("admin", submitted, null), submitted);
});

test("employee sheet access is limited to today and the assigned warehouse", () => {
  assert.equal(typeof policy.canAccessDailyClosingSheet, "function");
  const scope = { inventoryDate: "2026-08-22", warehouseId: "assigned-warehouse" };

  assert.equal(policy.canAccessDailyClosingSheet!("employee", { inventoryDate: "2026-08-22", warehouseId: "assigned-warehouse" }, scope), true);
  assert.equal(policy.canAccessDailyClosingSheet!("employee", { inventoryDate: "2026-08-21", warehouseId: "assigned-warehouse" }, scope), false);
  assert.equal(policy.canAccessDailyClosingSheet!("employee", { inventoryDate: "2026-08-22", warehouseId: "other-warehouse" }, scope), false);
  assert.equal(policy.canAccessDailyClosingSheet!("employee", { inventoryDate: "2026-08-22", warehouseId: null }, scope), false);
  assert.equal(policy.canAccessDailyClosingSheet!("employee", { inventoryDate: "2026-08-22", warehouseId: "assigned-warehouse" }, null), false);
});

test("admin sheet access remains unrestricted by employee date or warehouse scope", () => {
  assert.equal(typeof policy.canAccessDailyClosingSheet, "function");
  assert.equal(policy.canAccessDailyClosingSheet!("admin", { inventoryDate: "2025-01-01", warehouseId: null }, null), true);
});

test("revision, draft editing, finalization, verification, and history remain admin-only", () => {
  assert.equal(typeof policy.canUseDailyClosingAdminWorkflow, "function");
  assert.equal(policy.canUseDailyClosingAdminWorkflow!("employee"), false);
  assert.equal(policy.canUseDailyClosingAdminWorkflow!("admin"), true);
});

test("forbidden workflow permissions alone cannot grant an employee report-view access", () => {
  assert.equal(typeof policy.canEmployeeAccessDailyClosingPage, "function");
  assert.equal(policy.canEmployeeAccessDailyClosingPage!(["inventory.daily_closing_finalize", "inventory.daily_closing_verify", "inventory.daily_closing_view_history"]), false);
  assert.equal(policy.canEmployeeAccessDailyClosingPage!(["inventory.daily_closing_view"]), true);
  assert.equal(policy.canEmployeeAccessDailyClosingPage!(["inventory.daily_closing_generate"]), true);
  assert.equal(policy.canEmployeeAccessDailyClosingPage!(["inventory.daily_closing_print"]), true);
});

test("employee restrictions are wired into every Daily Closing server entry point", async () => {
  const [page, actions, history, printPage, sourceData] = await Promise.all([
    readFile(new URL("../app/admin/inventory/daily-closing/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/daily-closing/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/daily-closing/history/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/daily-closing/[id]/print/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/inventory/daily-closing-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /canEmployeeAccessDailyClosingPage\(permissions\)/);
  assert.match(page, /canAccessDailyClosingSheet/);
  assert.match(page, /linesQuery\.or\("stock_in\.gt\.0,stock_out\.gt\.0"\)/);
  assert.match(page, /movementsQuery[\s\S]+?\.eq\("warehouse_id", employeeAssignment!?\.warehouseId\)/);
  assert.match(actions, /constrainDailyClosingGeneration/);
  assert.equal((actions.match(/canUseDailyClosingAdminWorkflow\(profile\.role\)/g) ?? []).length, 4);
  assert.match(history, /canUseDailyClosingAdminWorkflow\(profile\.role\)/);
  assert.match(printPage, /canAccessDailyClosingSheet/);
  assert.match(printPage, /movementsQuery[\s\S]+?\.eq\("warehouse_id", employeeAssignment!?\.warehouseId\)/);
  assert.match(sourceData, /options\.movementOnly === true/);
  assert.match(sourceData, /loadEmployeeBalances/);
  assert.match(sourceData, /loadEmployeeConfirmedMovements/);
  assert.match(sourceData, /\["confirmed_at", "created_at"\]/);
  assert.match(sourceData, /\.eq\("status", "confirmed"\)/);
  assert.match(sourceData, /\.is\("confirmed_at", null\)/);
  assert.match(sourceData, /\.eq\("warehouse_id", warehouseId\)[\s\S]+?\.range/);
  assert.match(sourceData, /inventory_balances[\s\S]+?\.order\("id", \{ ascending: true \}\)\.range/);
  assert.match(sourceData, /\.order\(timestamp, \{ ascending: true \}\)\.order\("id", \{ ascending: true \}\)\.range/);
  assert.match(sourceData, /inventory_movement_items[\s\S]+?\.order\("id", \{ ascending: true \}\)\.range/);
});

test("movement-only aggregation excludes quiet stock while default admin aggregation remains unchanged", () => {
  const baseInput = {
    inventoryDate: "2026-08-22",
    warehouseId: "assigned-warehouse",
    includeAllProducts: false,
    balances: [
      { productId: "active", variationId: null, warehouseId: "assigned-warehouse", onHand: 6, productName: "Active product", sku: "ACTIVE", model: null },
      { productId: "quiet", variationId: null, warehouseId: "assigned-warehouse", onHand: 9, productName: "Quiet product", sku: "QUIET", model: null },
    ],
    movements: [
      {
        id: "today-in",
        reference: "IN",
        movementType: "purchase_receipt",
        status: "confirmed",
        transactionAt: "2026-08-22T03:00:00.000Z",
        itemId: "item-active",
        productId: "active",
        variationId: null,
        warehouseId: "assigned-warehouse",
        quantityDelta: 2,
        productName: "Active product",
        sku: "ACTIVE",
        model: null,
      },
    ],
  };

  const adminResult = dailyClosing.aggregateDailyClosing(baseInput);
  const explicitAdminResult = dailyClosing.aggregateDailyClosing({ ...baseInput, movementOnly: false });
  const employeeResult = dailyClosing.aggregateDailyClosing({ ...baseInput, movementOnly: true });

  assert.deepEqual(adminResult.rows.map((row) => row.productId).sort(), ["active", "quiet"]);
  assert.deepEqual(explicitAdminResult, adminResult);
  assert.deepEqual(employeeResult.rows.map((row) => row.productId), ["active"]);
  assert.equal(employeeResult.rows[0]?.stockIn, 2);
});
