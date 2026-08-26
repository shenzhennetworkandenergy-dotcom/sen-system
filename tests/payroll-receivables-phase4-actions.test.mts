import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const actionsPath = join(root, "app", "admin", "hr", "hr-actions.ts");

test("Payroll Paid delegates to the trusted atomic boundary", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /mark_hr_payroll_paid_with_receivables/);
  assert.doesNotMatch(source, /status === "paid"[\s\S]{0,500}\.from\("hr_payroll_records"\)\.update/);
  assert.doesNotMatch(source, /status === "paid"[\s\S]{0,500}journal_entries|cashbook_entries/);
});

test("Payroll action keeps Admin/Payroll authorization and exposes Phase 4 plan operations", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /requireHrAdmin\(\)/);
  assert.match(source, /payroll_receivable_deductions|planPayrollLoanDeductions/);
  assert.match(source, /assertPayrollStatusTransition/);
});
