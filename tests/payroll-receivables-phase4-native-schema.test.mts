import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = (await readFile("database/native/schema.sql", "utf8")).toLowerCase();
const migration = (await readFile("supabase/migrations/202608250005_payroll_receivables_phase4.sql", "utf8")).toLowerCase();

test("native schema appends Phase 4 after the Phase 3 migration", () => {
  const phase3 = schema.indexOf("create or replace function public.reverse_receivable_transaction");
  const phase4 = schema.indexOf("create table public.payroll_receivable_deductions");
  assert.ok(phase3 >= 0 && phase4 > phase3);
  assert.equal(schema.split("create table public.payroll_receivable_deductions").length - 1, 1);
  assert.equal(schema.split("create or replace function public.mark_hr_payroll_paid_with_receivables").length - 1, 1);
  assert.match(migration, /revoke all on function public\.prepare_hr_payroll_receivable_plan[\s\S]*mark_hr_payroll_paid_with_receivables/);
});

test("native Phase 4 contract preserves the trusted-only salary deduction boundary", () => {
  for (const token of [
    "payroll_receivable_deductions",
    "prepare_hr_payroll_receivable_plan",
    "approve_hr_payroll_with_receivables",
    "mark_hr_payroll_paid_with_receivables",
    "repayment_transaction_id",
    "source",
    "salary_deduction",
  ]) assert.match(schema, new RegExp(token));
  assert.match(schema, /grant execute on function public\.prepare_hr_payroll_receivable_plan[\s\S]*?mark_hr_payroll_paid_with_receivables[\s\S]*?to service_role/);
});
