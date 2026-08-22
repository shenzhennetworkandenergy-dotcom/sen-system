import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  "supabase/migrations/202608220001_employee_stock_out_product_release.sql",
  "utf8",
);
const page = await readFile(
  "app/employee/rma/[claimId]/receive/page.tsx",
  "utf8",
).catch(() => "");
const actions = await readFile(
  "app/employee/rma/[claimId]/receive/actions.ts",
  "utf8",
).catch(() => "");
const form = await readFile(
  "components/inventory/PhysicalReturnReceiptForm.tsx",
  "utf8",
).catch(() => "");

function lastFunction(name: string) {
  const start = migration.toLowerCase().lastIndexOf(`create or replace function public.${name}`);
  return start < 0 ? "" : migration.slice(start, migration.indexOf("end $$;", start) + 7);
}

const cancelSql = lastFunction("cancel_sales_order");
const returnSql = lastFunction("confirm_physical_return_receipt");

test("cancellation reverses only remaining reservation and cancels a pending request", () => {
  assert.match(cancelSql, /sales_stock_out_requests[\s\S]{0,180}for update/i);
  assert.match(cancelSql, /sales_stock_out_releases/);
  assert.match(cancelSql, /rma_return_receipts/);
  assert.match(cancelSql, /released_total[\s\S]{0,180}returned_total/i);
  assert.match(cancelSql, /proper physical return/i);
  assert.match(cancelSql, /reserved=greatest\(reserved-reservation\.quantity,0\)/i);
  assert.match(cancelSql, /status='cancelled'[\s\S]{0,180}sales_stock_out_requests/i);
  assert.doesNotMatch(cancelSql, /insert\s+into\s+public\.inventory_movements/i);
});

test("physical return is a token-idempotent rma.receive warehouse transaction", () => {
  assert.match(returnSql, /confirm_physical_return_receipt\(\s*actor_profile_id uuid,\s*requested_claim_id uuid,\s*requested_release_item_id uuid,\s*requested_operation_id uuid,\s*requested_quantity numeric,\s*requested_serial_ids uuid\[\]\s*\) returns uuid/i);
  assert.match(returnSql, /assert_actor_permission\(actor_profile_id,'rma\.receive'\)/i);
  assert.match(returnSql, /profile_warehouse_assignments/);
  assert.match(returnSql, /rma_return_receipts[\s\S]{0,180}operation_id=requested_operation_id/i);
  assert.match(returnSql, /for update/i);
});

test("return validates original release quantity and exact original serials", () => {
  assert.match(returnSql, /sales_stock_out_release_items/);
  assert.match(returnSql, /quantity_released/);
  assert.match(returnSql, /already_returned/);
  assert.match(returnSql, /requested_quantity[\s\S]{0,180}returnable/i);
  assert.match(returnSql, /sales_stock_out_release_serials/);
  assert.match(returnSql, /rma_return_receipt_serials/);
  assert.match(returnSql, /serial_number_id=any\(requested_serial_ids\)/i);
});

test("committed return increases physical stock once and writes customer_return audit", () => {
  assert.match(returnSql, /movement_type[\s\S]{0,120}'customer_return'/i);
  assert.match(returnSql, /set on_hand=on_hand\+requested_quantity/i);
  assert.match(returnSql, /quantity_delta[\s\S]{0,120}requested_quantity/i);
  assert.match(returnSql, /insert into public\.rma_return_receipts/i);
  assert.match(returnSql, /insert into public\.rma_events/i);
  assert.match(returnSql, /serial_number_history/i);
  assert.match(returnSql, /rma\.physical_return_received/i);
});

test("the narrow employee receipt page enforces rma.receive and uses one physical action", () => {
  assert.match(page, /requirePermission\("rma\.receive"\)/);
  assert.match(page, /getAuthorizedPhysicalReturnClaim/);
  assert.match(page, /<PhysicalReturnReceiptForm/);
  assert.match(form, /useActionState/);
  assert.match(form, /Confirm Physical Return Receipt/);
  assert.match(form, /operationId/);
  assert.match(form, /serial_id/);
  assert.match(actions, /confirm_physical_return_receipt/);
  assert.match(actions, /revalidatePath\("\/admin\/inventory\/daily-closing"\)/);
});
