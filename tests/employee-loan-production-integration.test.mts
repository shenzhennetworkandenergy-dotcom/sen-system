import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Employee Loan integration preserves the production Receivables boundary", () => {
  const nav = read("lib/navigation/dashboard.ts");
  const routes = read("lib/constants/routes.ts");
  const receivableList = read("app/admin/receivables/loans/page.tsx");
  const receivableDetail = read("app/admin/receivables/loans/[id]/page.tsx");

  assert.match(nav, /key:"receivables"/);
  assert.doesNotMatch(nav, /key:"employee-loans",label:"Employee Loans"/);
  assert.doesNotMatch(nav, /group:"Procurement and Finance"[^\n]*label:"Employee Loans"/);
  assert.match(routes, /adminReceivables:\s*"\/admin\/receivables"/);
  assert.match(routes, /adminReceivableLoans:\s*"\/admin\/receivables\/loans"/);
  assert.match(receivableList, /ReceivablesNavigation/);
  assert.match(receivableList, /Loans & Advances/);
  assert.match(receivableDetail, /ReceivablesNavigation|EmployeeLoanAdminPanel/);
});

test("Employee Loan release includes the approved workflow and a non-destructive forward migration", () => {
  assert.equal(existsSync(join(root, "app/employee/loans/page.tsx")), true);
  assert.equal(existsSync(join(root, "components/receivables/EmployeeLoanAgreement.tsx")), true);
  assert.equal(existsSync(join(root, "lib/receivables/employee-loans-data.ts")), true);
  const migrations = readFileSync(join(root, "supabase/migrations/202609110001_employee_loan_application_agreement.sql"), "utf8");
  assert.doesNotMatch(migrations, /\b(drop\s+(table|function|trigger|constraint)|truncate|delete\s+from)\b/i);
  assert.match(migrations, /receivable_employee_loan_details/);
});
