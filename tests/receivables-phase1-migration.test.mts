import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/202608250001_receivables_phase1.sql",
  import.meta.url,
);

const migration = await readFile(migrationUrl, "utf8").catch(() => "");

test("defines the additive Receivables Phase 1 schema and read models", () => {
  assert.match(migration, /^\s*begin\s*;/i);
  assert.match(migration, /commit\s*;\s*$/i);

  for (const table of [
    "receivable_external_parties",
    "receivable_accounts",
    "receivable_transactions",
  ]) {
    assert.match(
      migration,
      new RegExp(`create table public\\.${table}\\b`, "i"),
      `missing ${table}`,
    );
  }

  for (const view of [
    "customer_receivables_v",
    "non_sales_receivables_v",
    "receivables_overview_v",
  ]) {
    assert.match(
      migration,
      new RegExp(`create (?:or replace )?view public\\.${view}\\b`, "i"),
      `missing ${view}`,
    );
  }
});
test("adds the approved permissions without granting Standard Employees", () => {
  for (const key of [
    "receivables.view",
    "receivables.view_customer",
    "receivables.view_loans",
    "receivables.create",
    "receivables.manage_opening",
  ]) {
    assert.match(migration, new RegExp(key.replace(".", "\\."), "i"));
  }

  assert.doesNotMatch(
    migration,
    /permission_template_items[\s\S]*standard_employee[\s\S]*receivables\./i,
  );
});

test("protects writes with RLS, database authorization, idempotency, and audit", () => {
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /create_receivable_account/i);
  assert.match(migration, /create_opening_receivable/i);
  assert.match(migration, /assert_actor_permission[\s\S]*receivables\.(?:create|manage_opening)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /operation_id uuid not null unique/i);
  assert.match(migration, /insert into public\.audit_logs/i);
  assert.match(migration, /revoke all on table public\.receivable_transactions from anon,authenticated/i);
});

test("keeps Phase 1 operational and does not post or rewrite finance systems", () => {
  assert.doesNotMatch(
    migration,
    /insert into public\.(?:journal_entries|journal_lines|cashbook_entries|hr_payroll_records|hr_payroll_components|sale_payments)/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:update|delete from) public\.(?:sales_orders|sale_payments|journal_entries|cashbook_entries|hr_payroll_records|purchase_orders)/i,
  );
});
