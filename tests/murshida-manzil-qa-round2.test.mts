import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/murshida-manzil/page.tsx", "utf8");
const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");

test("Murshida owner and tenant lists are intentionally collapsed and human-readable", () => {
  assert.match(page, /See All Owners/);
  assert.match(page, /Inactive \/ Archived Owners/);
  assert.match(page, /See All Tenants/);
  assert.match(page, /Mobile number/);
  assert.doesNotMatch(page, /placeholder="Unit code snapshot"/);
  assert.doesNotMatch(page, /placeholder="Unit description snapshot"/);
});

test("Murshida rent entry uses month/year selects and hides internal unit fields", () => {
  assert.match(page, /name="rent_year"/);
  assert.match(page, /name="rent_month"/);
  assert.match(page, /January/);
  assert.match(page, /Advance adjusted against rent/);
  assert.doesNotMatch(page, /placeholder="Unit ID"/);
});

test("Murshida vouchers and owner income report are persisted routes", () => {
  assert.match(actions, /rentReceipt/);
  assert.match(actions, /advanceReceipt/);
  assert.match(actions, /expenseVoucher/);
  assert.equal(existsSync("app/admin/murshida-manzil/[id]/expense-voucher/page.tsx"), true);
  assert.equal(existsSync("app/admin/murshida-manzil/reports/owner-income/page.tsx"), true);
  assert.match(page, /Owner Income Report/);
});

test("tenant phone migration is additive and nullable", () => {
  const sql = readFileSync("supabase/migrations/202609150001_murshida_manzil_tenant_phone.sql", "utf8");
  assert.match(sql, /alter table murshida_manzil\.tenants/i);
  assert.match(sql, /add column if not exists phone_number text/i);
  assert.doesNotMatch(sql, /drop|truncate/i);
});
