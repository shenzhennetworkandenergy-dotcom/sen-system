import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/202608220001_employee_stock_out_product_release.sql";
const migration = await readFile(migrationPath, "utf8").catch(() => "");
const nativeBuilder = await readFile("scripts/build-native-schema.mjs", "utf8");
const nativeSeed = await readFile("database/native/seed.sql", "utf8");
const nativeSchema = await readFile("database/native/schema.sql", "utf8");

const requiredTables = [
  "sales_stock_out_requests",
  "sales_stock_out_request_items",
  "sales_stock_out_request_revisions",
  "sales_stock_out_request_revision_items",
  "sales_stock_out_releases",
  "sales_stock_out_release_items",
  "sales_stock_out_release_serials",
  "sales_stock_out_serial_changes",
  "rma_return_receipts",
  "rma_return_receipt_serials",
] as const;

test("stock out migration is present and strictly additive", () => {
  assert.ok(migration, `${migrationPath} must exist.`);
  assert.doesNotMatch(migration, /\bdrop\s+table\b/i);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(
    migration,
    /\bdelete\s+from\s+public\.(?:inventory|sales|serial|shipment|purchase|rma)/i,
  );
  assert.doesNotMatch(migration, /\balter\s+table\b[\s\S]{0,100}\bdrop\s+column\b/i);
});

test("migration creates every dedicated request, revision, release, and return ledger", () => {
  for (const table of requiredTables) {
    assert.match(
      migration,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, "i"),
      `${table} must be created additively.`,
    );
  }
});

test("migration enforces one request per sale and idempotent invoice, release, return, and serial operations", () => {
  assert.match(
    migration,
    /sales_stock_out_requests_sales_order_unique[\s\S]{0,160}unique\s*\(sales_order_id\)/i,
  );
  assert.match(
    migration,
    /sale_documents_finalization_idempotency_unique[\s\S]{0,180}finalization_idempotency_key/i,
  );
  assert.match(
    migration,
    /sales_stock_out_releases_operation_unique[\s\S]{0,160}unique\s*\(operation_id\)/i,
  );
  assert.match(
    migration,
    /rma_return_receipts_operation_unique[\s\S]{0,160}unique\s*\(operation_id\)/i,
  );
  assert.match(
    migration,
    /sales_stock_out_release_serials[\s\S]{0,900}rma_return_receipt_serials/i,
  );
  assert.doesNotMatch(
    migration,
    /sales_stock_out_release_serials_serial_unique[\s\S]{0,180}unique\s*\(serial_number_id\)/i,
  );
});

test("migration protects nonnegative request and ledger quantities", () => {
  assert.match(migration, /required_quantity\s*>=\s*released_quantity/i);
  assert.match(migration, /required_quantity\s*>=\s*0/i);
  assert.match(migration, /released_quantity\s*>=\s*0/i);
  assert.match(migration, /quantity_released\s*>\s*0/i);
  assert.match(
    migration,
    /remaining_quantity\s+numeric\(18,4\)\s+generated\s+always\s+as/i,
  );
});

test("migration adds the independent sensitive permission without assigning it to a template", () => {
  assert.match(migration, /inventory\.release_sales_stock/);
  assert.match(
    migration,
    /'Stock Out \/ Release Invoiced Products'/i,
  );
  assert.match(migration, /'release_sales_stock'[\s\S]{0,80}\btrue\b/i);
  assert.doesNotMatch(
    migration,
    /permission_template_items[\s\S]{0,400}inventory\.release_sales_stock/i,
  );
});

test("migration extends only the required physical movement and warehouse release statuses", () => {
  assert.match(migration, /inventory_movements_movement_type_check[\s\S]*?'stock_out'/i);
  assert.match(migration, /serial_numbers_status_check[\s\S]*?'warehouse_released'/i);
  assert.match(
    migration,
    /order_serial_allocations_status_check[\s\S]*?'warehouse_released'/i,
  );
  assert.match(
    migration,
    /add\s+column\s+if\s+not\s+exists\s+finalization_idempotency_key\s+uuid/i,
  );
});

test("all new ledgers use row security and employee reads are permission and warehouse scoped", () => {
  for (const table of requiredTables) {
    assert.match(
      migration,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      `${table} must enable RLS.`,
    );
  }
  assert.match(migration, /current_user_has_permission\('inventory\.release_sales_stock'/i);
  assert.match(migration, /profile_warehouse_assignments/i);
  assert.match(migration, /profiles[\s\S]{0,160}status\s*=\s*'active'/i);
  assert.match(migration, /grant\s+select[\s\S]*?to\s+authenticated/i);
  assert.match(migration, /revoke\s+(?:all|insert|update|delete)[\s\S]*?from\s+authenticated/i);
});

test("native PostgreSQL generation and seed include the additive Stock Out migration", () => {
  assert.match(
    nativeBuilder,
    /202608220001_employee_stock_out_product_release\.sql/,
  );
  assert.match(nativeSeed, /inventory\.release_sales_stock/);
  assert.match(
    nativeSchema,
    /create\s+table\s+if\s+not\s+exists\s+public\.sales_stock_out_requests/i,
  );
  assert.match(nativeSchema, /inventory\.release_sales_stock/);
});
