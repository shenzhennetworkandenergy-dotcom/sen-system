import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("employee permissions include the dedicated new-stock receipt control", async () => {
  const migration = await readFile("supabase/migrations/202608010001_purchase_serial_receipt_permission.sql", "utf8");
  assert.match(migration, /'inventory\.receive_new_stock'/);
  assert.match(migration, /'স্টকে নতুন পণ্য রিসিভ করুন'/);
  assert.match(migration, /when 'inventory\.receive' then array\['inventory\.receive_new_stock'\]/);
});

test("purchase stock receipt requires the dedicated employee permission", async () => {
  const actions = await readFile("app/admin/purchasing/actions.ts", "utf8");
  const page = await readFile("app/admin/purchasing/[id]/receive/page.tsx", "utf8");
  const detail = await readFile("app/admin/purchasing/[id]/page.tsx", "utf8");
  const printPage = await readFile("app/admin/serials/print/page.tsx", "utf8");
  const receiptMigration = await readFile("supabase/migrations/202608010006_preserve_expected_purchase_serials.sql", "utf8");
  assert.match(actions, /receivePurchaseOrderAction[\s\S]*requirePermission\("inventory\.receive_new_stock"\)/);
  assert.match(page, /requirePermission\([\s\S]*"inventory\.receive_new_stock"/);
  assert.match(detail, /permissions\.has\("inventory\.receive_new_stock"\)/);
  assert.match(printPage, /getEmployeePrimaryWarehouseId\(profile\.id\)/);
  assert.match(printPage, /purchase_orders\(status,destination_warehouse_id\)/);
  assert.match(receiptMigration, /assert_actor_permission\(actor_profile_id,'inventory\.receive_new_stock'\)/);
  assert.doesNotMatch(receiptMigration, /assert_actor_permission\(actor_profile_id,'inventory\.receive'\)/);
});

test("purchase receipt preserves and activates the pre-generated SEN serial", async () => {
  const purchasingMigration = await readFile("supabase/migrations/202608010006_preserve_expected_purchase_serials.sql", "utf8");
  const receiptForm = await readFile("components/purchasing/PurchaseReceiptForm.tsx", "utf8");
  assert.match(purchasingMigration, /where sn\.purchase_order_item_id=order_item\.id and sn\.status='expected'/);
  assert.match(purchasingMigration, /set manufacturer_serial=manufacturer,[\s\S]*status='available'/);
  assert.match(purchasingMigration, /serial_generation_batch_id/);
  assert.match(receiptForm, /The confirmed SEN serials activate automatically when this receipt is saved\./);
});
