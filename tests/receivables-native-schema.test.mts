import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builder = await readFile("scripts/build-native-schema.mjs", "utf8");
const migration = normalize(
  await readFile("supabase/migrations/202608250001_receivables_phase1.sql", "utf8"),
).trim();
const phase2Migration = normalize(
  await readFile("supabase/migrations/202608250002_customer_receivables_phase2.sql", "utf8"),
).trim();
const phase3Migration = normalize(
  await readFile("supabase/migrations/202608250004_non_sales_receivables_phase3.sql", "utf8"),
).trim();
const phase5Migration = normalize(
  await readFile("supabase/migrations/202608250006_receivables_accounting_phase5.sql", "utf8"),
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
  const customerReceivables = builder.indexOf("customerReceivablesMigration.trim()");
  const draftQuotationEditing = builder.indexOf("draftQuotationEditingMigration.trim()");
  const nonSalesReceivables = builder.indexOf("nonSalesReceivablesMigration.trim()");
  const payrollReceivables = builder.indexOf("payrollReceivablesMigration.trim()");
  const receivablesAccounting = builder.indexOf("receivablesAccountingMigration.trim()");

  assert.match(builder, /202608250001_receivables_phase1\.sql/);
  assert.match(builder, /202608250002_customer_receivables_phase2\.sql/);
  assert.match(builder, /202608250004_non_sales_receivables_phase3\.sql/);
  assert.match(builder, /202608250005_payroll_receivables_phase4\.sql/);
  assert.match(builder, /202608250006_receivables_accounting_phase5\.sql/);
  assert.ok(
    stockOutHotfix >= 0 &&
      receivables > stockOutHotfix &&
      customerReceivables > receivables &&
      draftQuotationEditing > customerReceivables &&
      nonSalesReceivables > draftQuotationEditing &&
      payrollReceivables > nonSalesReceivables &&
      receivablesAccounting > payrollReceivables,
  );
  assert.equal(occurrences(schema, migration), 1);
  assert.equal(occurrences(schema, phase2Migration), 1);
  assert.equal(occurrences(schema, phase3Migration), 1);
  assert.equal(occurrences(schema, phase5Migration), 1);
});

test("native schema exposes the Phase 5 accounting reconciliation contract exactly once", () => {
  assert.equal(occurrences(schema.toLowerCase(), "create table public.receivable_accounting_postings"), 1);
  assert.equal(occurrences(schema.toLowerCase(), "create or replace view public.receivable_accounting_reconciliation_v"), 1);
  for (const rpc of [
    "post_receivable_accounting_operation",
    "post_receivable_disbursement",
    "post_receivable_repayment",
    "post_receivable_adjustment",
    "reverse_receivable_accounting_posting",
  ]) {
    assert.equal(occurrences(schema.toLowerCase(), `create or replace function public.${rpc}(`), 1);
  }
  assert.match(phase5Migration, /enable row level security/i);
  assert.match(phase5Migration, /posting_status='posted'/i);
});

test("native schema exposes the Phase 3 operational Receivables contract exactly once", () => {
  assert.equal(
    occurrences(schema.toLowerCase(), "create table public.receivable_installments"),
    1,
  );
  for (const rpc of [
    "transition_receivable_account",
    "set_receivable_installment_schedule",
    "confirm_receivable_disbursement",
    "record_receivable_repayment",
    "record_receivable_adjustment",
    "reverse_receivable_transaction",
  ]) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create or replace function public.${rpc}(`),
      1,
    );
  }
  for (const permission of [
    "receivables.approve",
    "receivables.disburse",
    "receivables.record_repayment",
    "receivables.adjust",
  ]) {
    assert.equal(
      occurrences(phase3Migration, `('${permission}',`),
      1,
      `${permission} must be added to the permission catalogue once`,
    );
  }
  for (const view of [
    "non_sales_receivable_details_v",
    "receivable_installment_status_v",
    "non_sales_receivable_metrics_v",
  ]) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create or replace view public.${view}`),
      1,
      `${view} must contain one Phase 3 definition`,
    );
  }
  assert.doesNotMatch(
    phase3Migration,
    /permission_template_items[\s\S]{0,1000}receivables\.(?:approve|disburse|record_repayment|adjust)/i,
  );
});

test("native schema exposes the Phase 2 Sales terms and derived read contract exactly once", () => {
  for (const column of [
    "payment_terms_type",
    "credit_period_days",
    "payment_due_date",
  ]) {
    assert.equal(occurrences(phase2Migration, `add column if not exists ${column}`), 1);
  }
  for (const view of [
    "customer_receivables_detail_v",
    "customer_receivables_summary_v",
    "customer_receivables_metrics_v",
  ]) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create or replace view public.${view}`),
      1,
    );
  }
  assert.equal(
    occurrences(
      schema.toLowerCase(),
      "create or replace function public.update_sale_commercial_terms(",
    ),
    1,
  );
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

  for (const [view, expectedDefinitions] of [
    ["customer_receivables_v", 2],
    ["non_sales_receivables_v", 2],
    ["receivables_overview_v", 3],
  ] as const) {
    assert.equal(
      occurrences(schema.toLowerCase(), `create or replace view public.${view}`),
      expectedDefinitions,
      `${view} must contain only its expected additive migration definitions`,
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
