import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeRepaymentMethodEdit, repaymentMethodLabel } from "../lib/receivables/employee-loan-repayment-method.ts";

const valid = { accountId: "8b0c35ef-5e91-4479-a5de-32962d91c2ab", operationId: "3431ac88-7482-46ca-a09c-7faac02f11ae", method: "salary_deduction", reason: "Reviewed future collection method", effectiveDate: "2026-10-25", expectedVersion: "3", confirmed: "on" };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("normalizes only supported existing methods, including Not set", () => {
  for (const method of ["", "salary_deduction", "cash", "bank", "mfs", "other"]) {
    assert.equal(normalizeRepaymentMethodEdit({ ...valid, method }).method, method || null);
  }
  assert.equal(repaymentMethodLabel(null), "Not set");
  assert.equal(repaymentMethodLabel("salary_deduction"), "Salary Deduction");
  assert.equal(normalizeRepaymentMethodEdit(valid).expectedVersion, 3);
});
test("rejects invalid methods, identifiers, versions, reasons and missing confirmation", () => {
  for (const patch of [{ method: "forgiven" }, { accountId: "bad" }, { operationId: "bad" }, { expectedVersion: "0" }, { expectedVersion: "1.2" }, { expectedVersion: "9007199254740992" }, { reason: "short" }, { reason: "x".repeat(2001) }, { confirmed: "" }]) {
    assert.throws(() => normalizeRepaymentMethodEdit({ ...valid, ...patch }));
  }
});
test("validates exact calendar dates without silently supplying today", () => {
  for (const effectiveDate of ["", "2026-02-29", "2026-04-31", "10/25/2026", "2026-10-25T00:00:00Z", "0000-01-01"]) {
    assert.throws(() => normalizeRepaymentMethodEdit({ ...valid, effectiveDate }), /date/i);
  }
  assert.equal(normalizeRepaymentMethodEdit({ ...valid, effectiveDate: "2028-02-29" }).effectiveDate, "2028-02-29");
});
test("server derives actual Admin identity and forwards only the narrow contract", () => {
  const source = read("app/admin/receivables/employee-loan-actions.ts");
  const action = source.split("export async function editEmployeeLoanRepaymentMethodAction")[1]?.split("export async function")[0];
  assert.ok(action);
  for (const pattern of [/requireProfile\(\["admin"\]\)/, /actor_profile_id: profile.id/, /edit_employee_loan_repayment_method_v1/, /unsupported field/, /revalidatePath/]) assert.match(action, pattern);
  assert.doesNotMatch(action, /requested_amount|requested_employee|\.from\(/);
});
test("Admin editor requires explicit date/terms confirmation and reason; no client authorization alone", () => {
  const page = read("app/admin/receivables/loans/[id]/page.tsx");
  const editor = read("components/receivables/EmployeeLoanRepaymentMethodEditor.tsx");
  assert.match(page, /isAdmin[\s\S]*repaymentMethod/);
  for (const pattern of [/Edit Repayment Method/, /name="reason"/, /name="confirmed"/, /name="effective_date"/, /Save/, /Cancel/, /role="status"/, /Historical/]) assert.match(editor, pattern);
});
test("new migration is additive configuration history, never a second financial ledger or historical rewrite", () => {
  const sql = read("supabase/migrations/202610250001_employee_loan_repayment_method_v1.sql");
  for (const pattern of [/assert_hr_admin\(actor_profile_id\)/, /Asia\/Dhaka/, /requested_expected_version/, /pg_advisory_xact_lock/, /for update/i, /payload_hash/, /old_values,new_values/, /status in \('draft','approved'\)/, /first_change.old_method/, /revoke all on function[\s\S]*from public,anon,authenticated/i]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /update\s+public\.(receivable_transactions|receivable_installments|hr_payroll_records|payroll_receivable_deductions|journal_entries|cashbook_entries|receivable_employee_loan_details)|delete from|disable trigger|session_replication_role/i);
  const planner = sql.split("create or replace function public.hr_payroll_plan_v1")[1];
  assert.ok(planner);
  assert.match(planner, /when a.category='employee_loan'/);
  assert.match(planner, /else a.default_repayment_method/);
  assert.doesNotMatch(sql, /create or replace function public.(mark_hr_payroll|record_receivable_repayment|confirm.*disbursement)/);
});
