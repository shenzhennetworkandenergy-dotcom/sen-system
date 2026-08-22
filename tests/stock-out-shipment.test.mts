import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  "supabase/migrations/202608220001_employee_stock_out_product_release.sql",
  "utf8",
);
const actions = await readFile("app/admin/shipments/actions.ts", "utf8");
const signature = "create or replace function public.dispatch_order_shipment";
const dispatchStart = migration.toLowerCase().lastIndexOf(signature);
const dispatchSql = dispatchStart >= 0
  ? migration.slice(dispatchStart, migration.indexOf("end $$;", dispatchStart) + 7)
  : "";

test("migration replaces shipment dispatch while preserving its stable RPC signature", () => {
  assert.ok(dispatchStart >= 0);
  assert.match(dispatchSql, /dispatch_order_shipment\(actor_profile_id uuid,requested_shipment_id uuid\) returns void/i);
  assert.match(dispatchSql, /shipments\.confirm_dispatch/);
});

test("dispatch is capped by committed Stock Out release quantity", () => {
  assert.match(dispatchSql, /sales_stock_out_release_items/);
  assert.match(dispatchSql, /quantity_released/);
  assert.match(dispatchSql, /shipped_quantity/);
  assert.match(dispatchSql, /not yet been released from inventory/i);
  assert.match(dispatchSql, /rma_return_receipts/);
  assert.match(dispatchSql, /released_total-returned_total/i);
  assert.match(dispatchSql, /sale\.status='cancelled'/i);
});

test("serialized dispatch accepts only exact warehouse-released serial allocations", () => {
  assert.match(dispatchSql, /shipment_serials/);
  assert.match(dispatchSql, /status='warehouse_released'/);
  assert.match(dispatchSql, /serial_count[\s\S]{0,180}(?:si|shipment_item)\.quantity/i);
  assert.match(dispatchSql, /set status='shipped'/);
});

test("dispatch is logistics-only and never performs a second stock mutation", () => {
  assert.doesNotMatch(dispatchSql, /update\s+public\.inventory_balances/i);
  assert.doesNotMatch(dispatchSql, /update\s+public\.inventory_reservations/i);
  assert.doesNotMatch(dispatchSql, /insert\s+into\s+public\.inventory_movements/i);
  assert.match(dispatchSql, /update\s+public\.shipments\s+set\s+status='dispatched'/i);
  assert.match(dispatchSql, /insert\s+into\s+public\.shipment_tracking_events/i);
});

test("shipment action reports dispatch without claiming another inventory update", () => {
  assert.match(actions, /"Shipment dispatched\."/);
  assert.doesNotMatch(actions, /Shipment dispatched and inventory updated/);
});
