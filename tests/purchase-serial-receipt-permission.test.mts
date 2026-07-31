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
  assert.match(actions, /receivePurchaseOrderAction[\s\S]*requireAllPermissions\(\["purchasing\.receive", "inventory\.receive_new_stock"\]\)/);
  assert.match(page, /requireAllPermissions\(\["purchasing\.receive","inventory\.receive_new_stock"\]\)/);
  assert.match(detail, /permissions\.has\("purchasing\.receive"\) && permissions\.has\("inventory\.receive_new_stock"\)/);
});

test("purchase receipt keeps automatic atomic SEN serial generation visible", async () => {
  const purchasingMigration = await readFile("supabase/migrations/202607240001_purchasing_module.sql", "utf8");
  const receiptForm = await readFile("components/purchasing/PurchaseReceiptForm.tsx", "utf8");
  assert.match(purchasingMigration, /generated:=public\.next_sen_serial\(order_item\.product_id\)/);
  assert.match(purchasingMigration, /serial_generation_batch_id/);
  assert.match(receiptForm, /Unique SEN serials generate automatically when this receipt is confirmed\./);
});
