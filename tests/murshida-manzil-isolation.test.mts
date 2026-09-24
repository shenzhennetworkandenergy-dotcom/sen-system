import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Murshida Manzil route is Admin-only and correctly named", () => {
  const layoutPath = "app/admin/murshida-manzil/layout.tsx";
  const nav = readFileSync("lib/navigation/dashboard.ts", "utf8");
  const routes = readFileSync("lib/constants/routes.ts", "utf8");
  assert.equal(existsSync(layoutPath), true);
  assert.match(readFileSync(layoutPath, "utf8"), /requireProfile\(\["admin"\]\)/);
  assert.match(routes, /adminMurshidaManzil:\s*["']\/admin\/murshida-manzil["']/);
  assert.match(nav, /Murshida Manzil/);
  assert.match(nav, /employeeVisible:false/);
  assert.doesNotMatch(nav, /Mosjida Manzil/);
});

test("Murshida Manzil database migration is schema-qualified and does not reference SEN transactions", () => {
  const migrationPath = "supabase/migrations/202609130001_murshida_manzil.sql";
  assert.equal(existsSync(migrationPath), true);
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /create schema if not exists murshida_manzil/i);
  assert.match(migration, /murshida_manzil\.owners/i);
  assert.match(migration, /murshida_manzil\.rent_transactions/i);
  assert.doesNotMatch(migration, /public\.(journal|cashbook|sales|sale_|purchase|inventory|audit_logs)/i);
  assert.doesNotMatch(migration, /mosjida_manzil/i);
});
