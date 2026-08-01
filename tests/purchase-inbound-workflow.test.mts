import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canPostPurchaseStock,
  nextPurchaseStatus,
  purchaseWorkflowSteps,
} from "../lib/purchasing/workflow.ts";

test("purchase workflow includes every inbound logistics stage in order", () => {
  assert.deepEqual(
    purchaseWorkflowSteps.map((step) => step.status),
    [
      "draft",
      "pending_approval",
      "approved",
      "ordered",
      "ready_for_shipment",
      "shipped",
      "received",
      "stock_received",
      "closed",
    ],
  );
});

test("purchase workflow advances only through valid transitions", () => {
  assert.equal(nextPurchaseStatus("draft", "submit"), "pending_approval");
  assert.equal(nextPurchaseStatus("pending_approval", "approve"), "approved");
  assert.equal(nextPurchaseStatus("approved", "order"), "ordered");
  assert.equal(nextPurchaseStatus("ordered", "prepare"), "ready_for_shipment");
  assert.equal(nextPurchaseStatus("ready_for_shipment", "ship"), "shipped");
  assert.equal(nextPurchaseStatus("shipped", "receive"), "received");
  assert.equal(nextPurchaseStatus("stock_received", "close"), "closed");
  assert.equal(nextPurchaseStatus("ordered", "receive"), null);
});

test("warehouse stock can only be posted after physical arrival", () => {
  assert.equal(canPostPurchaseStock("ordered"), false);
  assert.equal(canPostPurchaseStock("ready_for_shipment"), false);
  assert.equal(canPostPurchaseStock("shipped"), false);
  assert.equal(canPostPurchaseStock("received"), true);
  assert.equal(canPostPurchaseStock("partially_received"), true);
  assert.equal(canPostPurchaseStock("stock_received"), false);
});

test("purchase-order carrier lookup follows the migrated carrier status schema", async () => {
  const source = await readFile(
    new URL("../lib/purchasing/data.ts", import.meta.url),
    "utf8",
  );
  const carrierLookup = source.match(
    /db\.from\("purchase_carriers"\)[\s\S]*?\.order\("name"\)/,
  )?.[0];

  assert.ok(carrierLookup, "Purchase-order loader must query available carriers.");
  assert.match(carrierLookup, /\.eq\("status",\s*"active"\)/);
  assert.doesNotMatch(carrierLookup, /\.eq\("is_active"/);
});
