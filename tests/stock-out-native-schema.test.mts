import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native offline schema preserves carrier, Daily Closing, then Stock Out", async () => {
  const generator = await readFile("scripts/build-native-schema.mjs", "utf8");
  const schema = await readFile("database/native/schema.sql", "utf8");

  const carrier = generator.indexOf("purchaseCarrierMigration.trim()");
  const dailyClosing = generator.indexOf("dailyClosingMigration.trim()");
  const stockOut = generator.indexOf("stockOutMigration.trim()");
  assert.ok(carrier >= 0 && dailyClosing > carrier && stockOut > dailyClosing);
  assert.match(schema, /transition_purchase_inbound_shipment_with_carrier/i);
  assert.match(schema, /create table if not exists public\.inventory_daily_closing_sheets/i);
  assert.match(schema, /inventory\.daily_closing_print/i);
  assert.match(schema, /create table if not exists public\.sales_stock_out_requests/i);
});
