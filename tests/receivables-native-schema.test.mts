import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builder = await readFile("scripts/build-native-schema.mjs", "utf8");
const migration = normalize(
  await readFile("supabase/migrations/202608250001_receivables_phase1.sql", "utf8"),
).trim();
const schema = normalize(await readFile("database/native/schema.sql", "utf8"));

function normalize(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function occurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}

test("native builder appends the complete Receivables migration after the current production migrations", () => {
  const stockOutHotfix = builder.indexOf("stockOutReleaseQuantityMigration.trim()");
  const receivables = builder.indexOf("receivablesMigration.trim()");

  assert.match(builder, /202608250001_receivables_phase1\.sql/);
  assert.ok(stockOutHotfix >= 0 && receivables > stockOutHotfix);
  assert.equal(occurrences(schema, migration), 1);
});

test("native schema exposes the Phase 1 Receivables contract exactly once", () => {
  for (const table of [
    "receivable_external_parties",
    "receivable_accounts",
    "receivable_transactions",
  ]) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create table public.${table}`),
      1,
      `${table} must be created once`,
    );
  }

  for (const view of [
    "customer_receivables_v",
    "non_sales_receivables_v",
    "receivables_overview_v",
  ]) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create or replace view public.${view}`),
      1,
      `${view} must be defined once`,
    );
  }

  for (const rpc of ["create_receivable_account", "create_opening_receivable"]) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create or replace function public.${rpc}(`),
      1,
      `${rpc} must be defined once`,
    );
    assert.match(
      schema,
      new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role;`, "i"),
    );
  }

  const permissionCatalogue = migration.match(
    /insert into public\.permissions\([\s\S]*?cross join \(values([\s\S]*?)\) as entry\(/,
  );
  assert.ok(permissionCatalogue, "migration must define the Receivables permission catalogue");

  for (const permission of [
    "receivables.view",
    "receivables.view_customer",
    "receivables.view_loans",
    "receivables.create",
    "receivables.manage_opening",
  ]) {
    assert.equal(occurrences(permissionCatalogue[1], `'${permission}'`), 1);
  }
});

test("native Receivables permissions are not granted to Standard Employees", () => {
  assert.doesNotMatch(
    migration,
    /employee_permission_templates[\s\S]*receivables\./i,
  );
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /receivables\.view_loans/i);
});
