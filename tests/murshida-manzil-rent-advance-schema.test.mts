import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/202609130003_murshida_manzil_rent_advance_foundation.sql";

test("rent transactions gain backward-compatible unit identity snapshots", () => {
  assert.equal(existsSync(migrationPath), true);
  const sql = readFileSync(migrationPath, "utf8");
  const rentAlter = sql.slice(0, sql.indexOf("create index rent_transactions_unit_id_idx"));
  assert.match(rentAlter, /alter table murshida_manzil\.rent_transactions/i);
  assert.match(rentAlter, /add column unit_id uuid references murshida_manzil\.units\(id\) on delete restrict/i);
  assert.match(rentAlter, /add column unit_code_snapshot text/i);
  assert.doesNotMatch(rentAlter, /unit_id uuid not null/i);
  assert.doesNotMatch(rentAlter, /unit_code_snapshot text not null/i);
});

test("standalone advance payments preserve tenant and unit identity", () => {
  assert.equal(existsSync(migrationPath), true);
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /create table murshida_manzil\.advance_payments/i);
  assert.match(sql, /tenant_id uuid not null references murshida_manzil\.tenants\(id\) on delete restrict/i);
  assert.match(sql, /unit_id uuid references murshida_manzil\.units\(id\) on delete restrict/i);
  assert.match(sql, /unit_code_snapshot text not null/i);
  assert.match(sql, /amount numeric\(18,2\) not null/i);
  assert.match(sql, /payment_date date not null/i);
});

test("advance foundation is additive, keeps adjustments, and stays isolated from SEN", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.doesNotMatch(sql, /drop\s+(table|column)/i);
  assert.doesNotMatch(sql, /alter table murshida_manzil\.rent_advance_adjustments/i);
  assert.doesNotMatch(sql, /public\.(journal|cashbook|sales|sale_|purchase|inventory|customers|suppliers|hr_|audit_logs)/i);
});
