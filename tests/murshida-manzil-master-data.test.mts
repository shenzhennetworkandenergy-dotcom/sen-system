import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { validateOwnershipPercentages, validateOwnershipPercentagesForSetup } from "../lib/murshida-manzil/calculations.ts";

const migrationPath = "supabase/migrations/202609130002_murshida_manzil_units.sql";

test("unit foundation migration is additive and preserves tenant descriptions", () => {
  assert.equal(existsSync(migrationPath), true);
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /create table murshida_manzil\.units/i);
  assert.match(sql, /unit_code text not null/i);
  assert.match(sql, /is_active boolean not null default true/i);
  assert.match(sql, /alter table murshida_manzil\.tenants add column unit_id uuid/i);
  assert.match(sql, /references murshida_manzil\.units\(id\)/i);
  assert.match(sql, /unit_id uuid/i);
  assert.doesNotMatch(sql, /drop column.*unit_description/i);
  assert.doesNotMatch(sql, /update murshida_manzil\.tenants.*unit_description/i);
  assert.doesNotMatch(sql, /public\.(journal|cashbook|sales|purchase|inventory|audit_logs)/i);
});

test("Murshida master-data actions and page are Admin-only and isolated", () => {
  const actionsPath = "app/admin/murshida-manzil/actions.ts";
  const pagePath = "app/admin/murshida-manzil/page.tsx";
  assert.equal(existsSync(actionsPath), true);
  assert.equal(existsSync(pagePath), true);
  const actions = readFileSync(actionsPath, "utf8");
  const repository = readFileSync("lib/murshida-manzil/repository.ts", "utf8");
  const page = readFileSync(pagePath, "utf8");
  assert.match(actions, /requireProfile\(\["admin"\]\)/);
  assert.match(actions, /createUnitAction|updateUnitAction/);
  assert.match(actions, /createOwnerAction|updateOwnerAction/);
  assert.match(actions, /updateTenantUnitAction/);
  assert.match(repository, /unit_id/);
  assert.doesNotMatch(actions, /journal_entries|cashbook_entries|sales_orders|inventory_movements|audit_logs/);
  assert.match(page, /Units|Owners|Heirs/);
});

test("owner edit and delete bind their stable id through the form action", () => {
  const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  const page = readFileSync("app/admin/murshida-manzil/page.tsx", "utf8");
  assert.match(actions, /export async function updateOwnerAction\(id: string, form: FormData\)/);
  assert.match(actions, /export async function deleteOwnerAction\(id: string\)/);
  assert.match(page, /action=\{updateOwnerAction\.bind\(null, owner\.id\)\}/);
  assert.match(page, /formAction=\{deleteOwnerAction\.bind\(null, owner\.id\)\}/);
});

test("owner validation failures return a Murshida page message instead of throwing a page error", () => {
  const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  const page = readFileSync("app/admin/murshida-manzil/page.tsx", "utf8");
  assert.match(actions, /redirect\(`\$\{path\}\?error=/);
  assert.match(page, /filters\.error|filters.*error/);
  assert.match(page, /role="alert"/);
});

test("owner setup permits partial totals but rejects totals above 100%", () => {
  assert.doesNotThrow(() => validateOwnershipPercentagesForSetup([
    { percentage: 40 },
    { percentage: 30 },
  ]));
  assert.throws(() => validateOwnershipPercentagesForSetup([
    { percentage: 60 },
    { percentage: 50 },
  ]), /cannot exceed 100%/);
  assert.throws(() => validateOwnershipPercentages([
    { percentage: 40 },
    { percentage: 30 },
  ]), /exactly 100%/);
});

test("owner actions exclude inactive owners from setup totals and require 100% before allocation", () => {
  const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  assert.match(actions, /filter\(\(owner\) => owner\.is_active\)/);
  assert.match(actions, /validateOwnershipPercentagesForSetup\(all\)/);
  assert.match(actions, /must total exactly 100% before allocation/);
});

test("owner management supports phone, safe archive/delete, and all-owner summary", () => {
  const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  const repository = readFileSync("lib/murshida-manzil/repository.ts", "utf8");
  const page = readFileSync("app/admin/murshida-manzil/page.tsx", "utf8");
  assert.match(actions, /phone_number/);
  assert.match(actions, /deleteOwnerAction/);
  assert.match(repository, /owner_allocations/);
  assert.match(repository, /String\(row\.id\)/);
  assert.match(page, /See All Owners/);
  assert.match(page, /Phone Number/);
  assert.match(page, /Delete \/ Archive/);
  assert.match(page, /Inactive \/ Archived Owners/);
  assert.match(page, /Remaining ownership/);
  const migration = readFileSync("supabase/migrations/202609130005_murshida_manzil_owner_phone.sql", "utf8");
  assert.match(migration, /alter table murshida_manzil\.owners/i);
  assert.match(migration, /add column phone_number text/i);
});
