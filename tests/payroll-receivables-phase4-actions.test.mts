import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const actionsPath = join(root, "app", "admin", "hr", "payroll", "payroll-actions.ts");

test("Payroll Paid delegates to the trusted atomic boundary", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /mark_hr_payroll_paid_with_receivables/);
  assert.doesNotMatch(source, /status === "paid"[\s\S]{0,500}\.from\("hr_payroll_records"\)\.update/);
  assert.doesNotMatch(source, /status === "paid"[\s\S]{0,500}journal_entries|cashbook_entries/);
});

test("Payroll action keeps Admin/Payroll authorization and exposes Phase 4 plan operations", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /requireHrAdmin\(\)/);
  assert.match(source, /save_hr_payroll_draft_v1/);
  assert.match(source, /cancel_hr_payroll_v1/);
  assert.match(source, /confirm_hr_payroll_approval_v1/);
  assert.match(source, /assertPayrollStatusTransition/);
});
