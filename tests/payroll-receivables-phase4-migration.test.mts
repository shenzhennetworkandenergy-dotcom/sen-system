import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = join(root, "supabase", "migrations", "202608250005_payroll_receivables_phase4.sql");

test("Phase 4 migration is the next additive migration after Phase 3", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table\s+public\.payroll_receivable_deductions/i);
  assert.match(sql, /unique\s*\(\s*payroll_record_id\s*,\s*receivable_account_id\s*\)/i);
  assert.match(sql, /operation_id[\s\S]*unique/i);
  assert.match(sql, /repayment_transaction_id[\s\S]*unique/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /mark_hr_payroll_paid_with_receivables/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /status\s*=\s*'approved'/i);
  assert.match(sql, /salary_deduction/i);
  assert.match(sql, /'payroll'/i);
  assert.match(sql, /status=case when outstanding_after=0 then 'fully_repaid' else 'active' end/i);
  assert.match(sql, /Payroll marked paid and linked receivable repayments committed atomically/i);
  assert.match(sql, /The employee loan balance has changed since Payroll approval/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.(journal_entries|cashbook_entries)/i);
});

test("Phase 3 manual repayment guard remains intact", async () => {
  const sql = await readFile(join(root, "supabase", "migrations", "202608250004_non_sales_receivables_phase3.sql"), "utf8");
  assert.match(sql, /Salary deduction is reserved for Phase 4 Payroll integration/i);
});
