import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608250003_non_sales_receivables_phase3.sql", import.meta.url),
  "utf8",
).catch(() => "");

test("Phase 3 migration is additive and extends the generic Receivables foundation", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /salary_advance/);
  assert.match(migration, /rent_advance/);
  assert.match(migration, /alter table public\.receivable_accounts/i);
  assert.match(migration, /create table public\.receivable_installments/i);
  assert.match(migration, /unique\s*\(receivable_account_id,installment_number\)/i);
  assert.doesNotMatch(migration, /create table public\.(?:employee_loans|salary_advances|rent_advances)/i);
  assert.doesNotMatch(migration, /drop table|truncate table/i);
});

test("Phase 3 adds only the approved sensitive permissions and never grants Standard Employees", () => {
  for (const permission of [
    "receivables.approve",
    "receivables.disburse",
    "receivables.record_repayment",
    "receivables.adjust",
  ]) {
    assert.match(migration, new RegExp(permission.replace(".", "\\.")));
  }
  assert.doesNotMatch(
    migration,
    /permission_template_items[\s\S]{0,1000}receivables\.(?:approve|disburse|record_repayment|adjust)/i,
  );
});

test("database operations lock, reauthorize, use operation IDs, and audit atomically", () => {
  for (const fn of [
    "transition_receivable_account",
    "set_receivable_installment_schedule",
    "confirm_receivable_disbursement",
    "record_receivable_repayment",
    "record_receivable_adjustment",
    "reverse_receivable_transaction",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${fn}\\(`, "i"));
  }
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /assert_actor_permission/i);
  assert.match(migration, /operation_id/i);
  assert.match(migration, /operation_hash/i);
  assert.match(migration, /insert into public\.audit_logs/i);
});

test("immutable movements enforce one reversal and derive balances and FIFO installment state", () => {
  assert.match(
    migration,
    /create unique index[^;]*reversal_of_transaction_id[^;]*where reversal_of_transaction_id is not null/i,
  );
  assert.match(migration, /create or replace view public\.receivable_installment_status_v/i);
  assert.match(migration, /create or replace view public\.non_sales_receivable_details_v/i);
  assert.match(migration, /create or replace view public\.non_sales_receivable_metrics_v/i);
  assert.match(migration, /transaction\.direction[\s\S]*increase[\s\S]*transaction\.amount/i);
});

test("Phase 3 does not post Accounting, Cash Book, Sales payments, or Payroll", () => {
  assert.doesNotMatch(
    migration,
    /insert into public\.(?:journal_entries|journal_entry_lines|cashbook_entries|sale_payments|hr_payroll_records|hr_payroll_components)/i,
  );
  assert.doesNotMatch(migration, /record_sale_payment\s*\(/i);
  assert.doesNotMatch(migration, /update\s+public\.hr_payroll_records/i);
});

test("installments use RLS and direct writes stay service-only", () => {
  assert.match(migration, /alter table public\.receivable_installments enable row level security/i);
  assert.match(migration, /current_user_has_permission\('receivables\.view_loans'\)/i);
  assert.match(
    migration,
    /revoke all on public\.receivable_installments from (?:public,)?anon,authenticated/i,
  );
  assert.match(migration, /grant all on public\.receivable_installments to service_role/i);
  assert.match(migration, /grant execute on function public\.[^(]+\([^;]+to service_role/i);
});
