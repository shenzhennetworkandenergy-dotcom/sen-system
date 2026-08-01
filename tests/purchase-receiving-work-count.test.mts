import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { remainingPurchaseReceiptUnits } from "../lib/inventory/purchase-receiving.ts";

test("physical stock badge counts every unit still waiting to be received",()=>{
  assert.equal(remainingPurchaseReceiptUnits([
    {quantity_ordered:50,quantity_received:0,quantity_rejected:0},
    {quantity_ordered:10,quantity_received:4,quantity_rejected:1},
  ]),55);
});

test("partial and completed receipts reduce and clear the badge count",()=>{
  assert.equal(remainingPurchaseReceiptUnits([
    {quantity_ordered:5,quantity_received:3,quantity_rejected:0},
    {quantity_ordered:2,quantity_received:2,quantity_rejected:0},
  ]),2);
  assert.equal(remainingPurchaseReceiptUnits([
    {quantity_ordered:5,quantity_received:5,quantity_rejected:0},
  ]),0);
});

test("employee navigation renders the receiving count as a red attention badge", async () => {
  const [counts, shell, navigation] = await Promise.all([
    readFile("lib/dashboard/work-counts.ts", "utf8"),
    readFile("components/dashboard/Shell.tsx", "utf8"),
    readFile("components/dashboard/DashboardNavigation.tsx", "utf8"),
  ]);

  assert.match(counts, /"receive-new-stock": Math\.trunc\(remainingPurchaseReceiptUnits/);
  assert.match(counts, /purchase_orders\.destination_warehouse_id/);
  assert.match(shell, /getEmployeeWorkCounts\(profile\.id, resolvedEmployeePermissions\)/);
  assert.match(navigation, /count>0[\s\S]*bg-red-500/);
});
