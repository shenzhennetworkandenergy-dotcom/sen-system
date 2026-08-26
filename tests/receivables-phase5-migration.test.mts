import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608250006_receivables_accounting_phase5.sql", import.meta.url),
  "utf8",
).catch(() => "");

test("Phase 5 adds an immutable Receivable-to-Accounting posting link", () => {
  assert.match(migration, /create table public\.receivable_accounting_postings/i);
  assert.match(migration, /receivable_transaction_id uuid not null unique/i);
  assert.match(migration, /journal_entry_id uuid unique/i);
  assert.match(migration, /posting_status='posted' and journal_entry_id is not null/i);
  assert.match(migration, /operation_id uuid not null unique/i);
  assert.match(migration, /payload_hash/i);
  assert.match(migration, /reversal_of_posting_id/i);
  assert.match(migration, /one_reversal/i);
});

test("Phase 5 defines typed treatment and safe BDT mappings", () => {
  assert.match(migration, /accounting_treatment/i);
  for (const treatment of [
    "cash_disbursement",
    "cash_repayment",
    "cash_recovery",
    "rent_expense_offset",
    "payable_offset",
    "write_off",
    "non_cash_correction",
    "historical_opening",
  ]) {
    assert.match(migration, new RegExp(`['"]${treatment}['"]`, "i"));
  }
  assert.match(migration, /currency\s*<>\s*'BDT'|currency.*BDT/i);
  for (const code of ["1010", "1020", "1030", "1100"]) {
    assert.match(migration, new RegExp(`['"]${code}['"]`, "i"));
  }
});

test("Phase 5 exposes trusted atomic posting and reversal RPCs", () => {
  for (const rpc of [
    "post_receivable_disbursement",
    "post_receivable_repayment",
    "post_receivable_adjustment",
    "reverse_receivable_accounting_posting",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`));
    assert.match(migration, new RegExp(`${rpc}[\\s\\S]{0,800}security definer`));
  }
  assert.match(
    migration,
    /post_receivable_accounting_operation[\s\S]*receivable_accounting_assert_authority/i,
  );
  for (const wrapper of [
    "post_receivable_disbursement",
    "post_receivable_repayment",
    "post_receivable_adjustment",
  ]) {
    assert.match(
      migration,
      new RegExp(`${wrapper}[\\s\\S]{0,900}post_receivable_accounting_operation`),
    );
  }
  assert.match(migration, /lock_cashbook_timeline/i);
  assert.match(migration, /assert_cashbook_predecessor_closed/i);
  assert.match(migration, /This cashbook day is closed|closed cashbook day/i);
  assert.match(migration, /revoke all on function public\.(?:post_receivable_disbursement|post_receivable_repayment|post_receivable_adjustment|reverse_receivable_accounting_posting)/i);
  assert.match(migration, /grant execute on function public\.(?:post_receivable_disbursement|post_receivable_repayment|post_receivable_adjustment|reverse_receivable_accounting_posting)[\s\S]*to service_role/i);
});

test("Phase 5 does not alter Sales payment or Payroll accounting boundaries", () => {
  assert.doesNotMatch(migration, /create or replace function public\.record_sale_payment/i);
  assert.doesNotMatch(migration, /update public\.hr_payroll_records[\s\S]{0,600}status\s*=\s*'paid'/i);
  assert.doesNotMatch(migration, /insert into public\.sale_payments/i);
  assert.doesNotMatch(migration, /insert into public\.payroll_receivable_deductions/i);
});

test("Phase 5 includes a permission-safe reconciliation read model", () => {
  assert.match(migration, /create or replace view public\.receivable_accounting_reconciliation_v/i);
  assert.match(migration, /current_user_has_permission\('receivables\.view_loans'\)/i);
  assert.match(migration, /journal_entry_number/i);
  assert.match(migration, /cashbook_entry_id/i);
  assert.match(migration, /posting_status/i);
});
