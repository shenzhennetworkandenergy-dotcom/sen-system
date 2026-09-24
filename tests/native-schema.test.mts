import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native schema has local compatibility roles and no Supabase Auth foreign key", async () => {
  const schema = await readFile(new URL("../database/native/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /create role service_role/i);
  assert.match(schema, /create schema if not exists auth/i);
  assert.match(schema, /create (?:or replace )?function auth\.uid/i);
  assert.match(schema, /create table public\.local_user_credentials/i);
  assert.match(schema, /create table public\.local_user_sessions/i);
  assert.doesNotMatch(schema, /references auth\.users/i);
});

test("native schema installs pgcrypto where existing functions resolve it", async () => {
  const schema = await readFile(new URL("../database/native/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /create schema if not exists extensions/i);
  assert.match(schema, /create extension if not exists pgcrypto with schema extensions/i);
});

test("native schema preserves the existing carrier and Daily Closing offline migrations", async () => {
  const schema = await readFile(new URL("../database/native/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /transition_purchase_inbound_shipment_with_carrier/i);
  assert.match(schema, /create table if not exists public\.inventory_daily_closing_sheets/i);
  assert.match(schema, /inventory\.daily_closing_print/i);
});

test("native schema includes the atomic Sales payment accounting integration", async () => {
  const schema = await readFile(new URL("../database/native/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /sale_payments_operation_id_unique/i);
  assert.match(schema, /cashbook_entries_sale_payment_id_unique/i);
  assert.match(schema, /record_sale_payment[\s\S]*requested_operation_id/i);
  assert.match(schema, /cannot be cancelled directly[\s\S]*authorized payment reversal process/i);
});
