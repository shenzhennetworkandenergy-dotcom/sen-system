import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receivePagePath = "app/employee/inventory/receive/page.tsx";

test("the authorized Employee Receive navigation target has a real page", async () => {
  const page = await readFile(receivePagePath, "utf8").catch(() => "");

  assert.ok(
    page,
    "The sidebar target /employee/inventory/receive must be backed by an App Router page.",
  );
  assert.match(page, /export default async function EmployeePurchaseStockReceiptPage/);
  assert.match(page, /requirePermission\("inventory\.receive_new_stock"\)/);
  assert.match(page, /profile_warehouse_assignments/);
  assert.match(page, /\.eq\("profile_id", profile\.id\)/);
  assert.match(page, /\.eq\("is_primary", true\)/);
  assert.match(page, /\.eq\("is_active", true\)/);
  assert.doesNotMatch(page, /notFound\s*\(/);
});

test("the restored Employee Receive page keeps the established physical receipt workflow", async () => {
  const page = await readFile(receivePagePath, "utf8").catch(() => "");

  assert.match(page, /\.in\("status", \["received", "partially_received"\]\)/);
  assert.match(page, /destination_warehouse_id/);
  assert.match(page, /purchase_inbound_shipments\(carrier_name,tracking_number\)/);
  assert.match(page, /\/admin\/purchasing\/\$\{order\.id\}\/receive/);
});
