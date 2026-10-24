import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeEmployeeLoanStartDateEdit } from "../lib/receivables/employee-loan-start-date.ts";
import { buildInstallmentSchedule } from "../lib/receivables/non-sales.ts";
import { planPayrollLoanDeductions } from "../lib/hr/payroll-receivables.ts";

const accountId = "8b0c35ef-5e91-4479-a5de-32962d91c2ab";
const valid = { accountId, startDate: "2026-12-05", expectedVersion: "3", confirmed: "on" };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("normalizes only the date, loan ID and optimistic version after confirmation", () => {
  assert.deepEqual(normalizeEmployeeLoanStartDateEdit(valid), { accountId, startDate: "2026-12-05", expectedVersion: 3 });
});

test("rejects impossible dates, blank dates, timestamps and non-ISO dates", () => {
  for (const startDate of ["", "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-12-05T00:00:00Z", "12/05/2026", "0000-01-01"]) {
    assert.throws(() => normalizeEmployeeLoanStartDateEdit({ ...valid, startDate }), /date/i);
  }
  assert.equal(normalizeEmployeeLoanStartDateEdit({ ...valid, startDate: "2028-02-29" }).startDate, "2028-02-29");
});

test("rejects invalid loan IDs, unsafe versions and missing confirmation", () => {
  assert.throws(() => normalizeEmployeeLoanStartDateEdit({ ...valid, accountId: "../../admin" }), /loan/i);
  for (const expectedVersion of ["", "0", "1.5", "-1", "9007199254740992"]) assert.throws(() => normalizeEmployeeLoanStartDateEdit({ ...valid, expectedVersion }), /refresh|version/i);
  assert.throws(() => normalizeEmployeeLoanStartDateEdit({ ...valid, confirmed: "" }), /confirm/i);
});

test("salary deductions follow shifted installment due dates, not the application label", () => {
  const schedule = buildInstallmentSchedule({ approvedAmount: 12000, installmentCount: 3, installmentAmount: 4000, firstDueDate: "2026-12-05" });
  const input = { employeeRecordId: "employee-test", currency: "BDT", currentGrossPay: 30000, existingDeductions: 0, accounts: [{ id: accountId, employeeRecordId: "employee-test", category: "employee_loan", status: "active", currency: "BDT", outstandingAmount: 12000, repaymentMethod: "salary_deduction", installment: { installmentNumber: 1, dueDate: schedule[0].dueDate, amountDue: 4000, remainingAmount: 4000 } }] };
  assert.equal(planPayrollLoanDeductions({ ...input, periodEnd: "2026-11-30" }).deductions.length, 0);
  assert.equal(planPayrollLoanDeductions({ ...input, periodEnd: "2026-12-04" }).deductions.length, 0);
  assert.equal(planPayrollLoanDeductions({ ...input, periodEnd: "2026-12-31" }).deductions[0].amount, 4000);
});

test("the existing month-end schedule policy keeps principal, installment count and amounts", () => {
  const schedule = buildInstallmentSchedule({ approvedAmount: 10000, installmentCount: 3, installmentAmount: 3333, firstDueDate: "2028-01-31" });
  assert.deepEqual(schedule.map(row => row.dueDate), ["2028-01-31", "2028-02-29", "2028-03-31"]);
  assert.deepEqual(schedule.map(row => row.amountDue), [3333, 3333, 3334]);
});

test("server action derives Admin identity and does not accept amount or employee changes", () => {
  const action = read("app/admin/receivables/employee-loan-actions.ts").split("export async function editEmployeeLoanStartDateAction")[1];
  assert.ok(action, "Admin start-date action is missing");
  assert.match(action, /requireProfile\(\["admin"\]\)/);
  assert.match(action, /actor_profile_id: profile.id/);
  assert.match(action, /edit_employee_loan_start_date/);
  assert.match(action, /revalidatePath/);
  assert.doesNotMatch(action, /\.from\(|requested_amount|requested_installment_amount|requested_employee/);
});

test("date editor is gated by Admin role with edit, confirmation, cancel and feedback", () => {
  const page = read("app/admin/receivables/loans/[id]/page.tsx");
  const panel = read("components/receivables/EmployeeLoanAdminPanel.tsx");
  const editor = read("components/receivables/EmployeeLoanStartDateEditor.tsx");
  assert.match(page, /canEditStartDate: isAdmin/);
  assert.match(panel, /permissions.canEditStartDate/);
  for (const pattern of [/Edit Preferred Start/, /type="date"/, /Save/, /Cancel/, /name="confirmed"/, /role="status"/]) assert.match(editor, pattern);
});

test("migration preserves frozen schedules except narrowly authorized date-only changes", () => {
  const sql = read("supabase/migrations/202610230001_employee_loan_start_date_edit_v1.sql");
  assert.match(sql, /assert_hr_admin\(actor_profile_id\)/);
  assert.match(sql, /for update/i);
  assert.match(sql, /expected_version/);
  assert.match(sql, /app.employee_loan_start_date_account/);
  assert.match(sql, /to_jsonb\(new\)\s*-\s*'due_date'/i);
  assert.match(sql, /Approved installment schedules are immutable/);
  assert.match(sql, /payroll_receivable_deductions/);
  assert.match(sql, /hr_payroll_records/);
  assert.match(sql, /signed_agreement/);
  assert.match(sql, /old_values,new_values/);
  assert.match(sql, /revoke all on function[\s\S]*from public,anon,authenticated/i);
  assert.doesNotMatch(sql, /disable trigger|session_replication_role|update\s+public\.(receivable_transactions|hr_payroll_records|payroll_receivable_deductions|journal_entries|cashbook_entries)|delete from|alter table/i);
});
