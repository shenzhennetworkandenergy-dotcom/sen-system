import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  "supabase/migrations/202608220001_employee_stock_out_product_release.sql",
  "utf8",
);
const releaseQuantityHotfixMigration = await readFile(
  "supabase/migrations/202608240001_stock_out_authoritative_release_quantity.sql",
  "utf8",
).catch(() => "");
const actions = await readFile(
  "app/employee/inventory/stock-out/actions.ts",
  "utf8",
).catch(() => "");
const form = await readFile(
  "components/inventory/StockOutReleaseForm.tsx",
  "utf8",
).catch(() => "");
const detail = await readFile(
  "app/employee/inventory/stock-out/[requestId]/page.tsx",
  "utf8",
);

test("Confirm Stock Out is a token-idempotent atomic RPC", () => {
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.confirm_sales_stock_out\s*\(\s*actor_profile_id\s+uuid\s*,\s*requested_request_id\s+uuid\s*,\s*requested_operation_id\s+uuid\s*,\s*requested_items\s+jsonb\s*\)\s*returns\s+uuid/i,
  );
  assert.match(migration, /sales_stock_out_releases[\s\S]{0,220}operation_id=requested_operation_id/i);
  assert.match(migration, /request_version[\s\S]{0,240}request\.version/i);
  assert.match(migration, /sales_stock_out_requests[\s\S]{0,180}for\s+update/i);
  assert.match(migration, /sales_stock_out_request_items[\s\S]{0,220}for\s+update/i);
  assert.match(migration, /inventory_balances[\s\S]{0,220}for\s+update/i);
  assert.match(migration, /inventory_reservations[\s\S]{0,220}for\s+update/i);
});

test("release validates authoritative remaining, reserved, physical, and exact serial quantities", () => {
  assert.match(
    releaseQuantityHotfixMigration,
    /pg_get_functiondef\(function_signature::oid\)/i,
  );
  assert.doesNotMatch(
    releaseQuantityHotfixMigration,
    /raise\s+exception\s+'% has only % packed unit\(s\) eligible for release'/i,
  );
  assert.match(
    releaseQuantityHotfixMigration,
    /request_item\.remaining_quantity/i,
  );
  assert.match(releaseQuantityHotfixMigration, /execute\s+updated_definition/i);
  assert.match(migration, /balance\.reserved\s*<\s*quantity_to_release/i);
  assert.match(migration, /balance\.on_hand\s*<\s*quantity_to_release/i);
  assert.match(migration, /array_length\(selected_serial_ids,1\)[\s\S]{0,180}quantity_to_release/i);
  assert.match(migration, /serial\.product_id[\s\S]{0,180}request_item\.product_id/i);
  assert.match(migration, /serial\.warehouse_id[\s\S]{0,180}request\.warehouse_id/i);
  assert.match(migration, /damaged[\s\S]{0,120}unavailable[\s\S]{0,120}quarantined/i);
  assert.match(migration, /preassigned_serial_count[\s\S]{0,500}assigned to this finalized invoice/i);
  assert.match(migration, /not exists[\s\S]{0,300}rma_return_receipt_serials/i);
});

test("one confirmed release writes physical balance, reservation, movement, immutable ledger, and audit together", () => {
  assert.match(migration, /set\s+on_hand=on_hand-quantity_to_release\s*,\s*reserved=reserved-quantity_to_release/i);
  assert.match(migration, /movement_type[\s\S]{0,120}'stock_out'/i);
  assert.match(migration, /quantity_delta[\s\S]{0,120}-quantity_to_release/i);
  assert.match(migration, /insert\s+into\s+public\.sales_stock_out_releases/i);
  assert.match(migration, /insert\s+into\s+public\.sales_stock_out_release_items/i);
  assert.match(migration, /insert\s+into\s+public\.sales_stock_out_release_serials/i);
  assert.match(migration, /status='warehouse_released'/i);
  assert.match(migration, /sale\.stock_out_confirmed/i);
});

test("partial and full status derive from committed released totals", () => {
  assert.match(migration, /released_quantity=released_quantity\+quantity_to_release/i);
  assert.match(migration, /partially_released/);
  assert.match(migration, /fully_released/);
  assert.match(migration, /version=version\+1/);
});

test("explicit serial replacement is warehouse/product scoped and audited", () => {
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.replace_stock_out_serial/i);
  assert.match(migration, /requested_reason/);
  assert.match(migration, /sales_stock_out_serial_changes/);
  assert.match(migration, /previous_serial_number_id/);
  assert.match(migration, /replacement_serial_number_id/);
  assert.match(migration, /already been physically released/i);
  assert.match(migration, /update\s+public\.shipment_serials[\s\S]{0,180}serial_number_id=replacement_serial\.id/i);
  assert.match(migration, /previous_result_status[\s\S]{0,360}quarantined/i);
  assert.doesNotMatch(
    migration.slice(migration.toLowerCase().lastIndexOf("create or replace function public.replace_stock_out_serial")),
    /previous_serial\.id[\s\S]{0,100}status='available'/i,
  );
  assert.match(actions, /select\("request_id"\)/);
  assert.match(
    actions,
    /revalidatePath\(`\/employee\/inventory\/stock-out\/\$\{requestItemResult\.data\.request_id\}`\)/,
  );
});

test("release form uses one operation token, action state, serial search, and replacement reason", () => {
  assert.match(form, /useActionState/);
  assert.match(form, /operationId/);
  assert.match(form, /release_payload/);
  assert.match(form, /requestVersion/);
  assert.match(form, /requestItemId/);
  assert.match(form, /\/api\/employee\/inventory\/stock-out\/serials/);
  assert.match(form, /replacement reason/i);
  assert.match(actions, /confirm_sales_stock_out/);
  assert.match(actions, /replace_stock_out_serial/);
  assert.match(actions, /revalidatePath\("\/employee\/inventory\/stock-out"\)/);
  assert.match(detail, /<StockOutReleaseForm/);
  assert.match(detail, /key=\{`\$\{detail\.request\.id\}:\$\{detail\.request\.version\}`\}/);
  assert.match(form, /disabled=\{serial\.preselected\}/);
});

test("release form derives its quantity limit from the Stock Out request remainder, not packing", () => {
  assert.match(
    form,
    /Math\.max\(0,\s*item\.remainingQuantity\)/,
  );
  assert.match(form, /max=\{item\.remainingQuantity\}/);
  assert.doesNotMatch(
    form,
    /max=\{Math\.min\(item\.remainingQuantity,\s*item\.packedRemainingQuantity\)\}/,
  );
  assert.match(form, /Selected:\s*\{selected\.length\}/);
  assert.match(form, /count must exactly match this product&apos;s release quantity/i);
});

test("upstream allocation and cancellation preserve unavailable serial safety", () => {
  assert.match(
    migration,
    /create or replace function public\.allocate_order_serials[\s\S]*lower\(coalesce\(serial\.condition,''\)\) in\([\s\S]{0,120}'damaged','unavailable','lost','disposed','quarantined'/i,
  );
  assert.match(
    migration,
    /create or replace function public\.auto_allocate_order_serials[\s\S]*lower\(coalesce\(condition,''\)\) not in\([\s\S]{0,120}'damaged','unavailable','lost','disposed','quarantined'/i,
  );
  assert.match(
    migration,
    /create or replace function public\.cancel_sales_order[\s\S]*cancelled_serial_result_status[\s\S]*when 'unavailable' then 'unavailable'/i,
  );
});
