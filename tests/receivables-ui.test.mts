import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8").catch(() => "");

const [routes, navigation, internalNavigation, dashboard, customers, loans] = await Promise.all([
  read("../lib/constants/routes.ts"),
  read("../lib/navigation/dashboard.ts"),
  read("../components/receivables/ReceivablesNavigation.tsx"),
  read("../app/admin/receivables/page.tsx"),
  read("../app/admin/receivables/customers/page.tsx"),
  read("../app/admin/receivables/loans/page.tsx"),
]);

test("declares only the three approved Phase 1 routes", () => {
  assert.match(routes, /adminReceivables:\s*["']\/admin\/receivables["']/);
  assert.match(routes, /adminCustomerReceivables:\s*["']\/admin\/receivables\/customers["']/);
  assert.match(routes, /adminReceivableLoans:\s*["']\/admin\/receivables\/loans["']/);
  assert.doesNotMatch(routes, /receivables\/(?:collections|overdue)/i);
});

test("adds one Receivables main-sidebar item with module permission", () => {
  const matches = navigation.match(/key:["']receivables["']/g) ?? [];
  assert.equal(matches.length, 1);
  assert.match(
    navigation,
    /key:["']receivables["'][\s\S]*group:["']Procurement and Finance["'][\s\S]*requiredPermission:["']receivables\.view["']/,
  );
  assert.match(navigation, /route:routes\.adminReceivables/);
});

test("internal navigation is permission-aware and has no empty modules", () => {
  assert.match(internalNavigation, /Receivables Dashboard/);
  assert.match(internalNavigation, /Customer Receivables/);
  assert.match(internalNavigation, /Loans & Advances/);
  assert.match(internalNavigation, /canViewCustomer/);
  assert.match(internalNavigation, /canViewLoans/);
  assert.doesNotMatch(internalNavigation, /Collections|Overdue/);
});

test("pages enforce module and category permissions before loading data", () => {
  assert.match(dashboard, /requirePermission\("receivables\.view"\)/);
  assert.match(dashboard, /getReceivablesDashboard/);
  assert.match(dashboard, /canViewCustomer/);
  assert.match(dashboard, /canViewLoans/);
  assert.match(customers, /requireAllPermissions\(\[[\s\S]*receivables\.view[\s\S]*receivables\.view_customer/);
  assert.match(customers, /getCustomerReceivables/);
  assert.match(loans, /requireAllPermissions\(\[[\s\S]*receivables\.view[\s\S]*receivables\.view_loans/);
  assert.match(loans, /getNonSalesReceivables/);
});

test("Loans UI exposes forms only through the two write permissions", () => {
  assert.match(loans, /receivables\.create/);
  assert.match(loans, /receivables\.manage_opening/);
  assert.match(loans, /RequestedReceivableForm/);
  assert.match(loans, /OpeningReceivableForm/);
  assert.match(loans, /Opening balance/);
  assert.doesNotMatch(loans, /Payroll deduction|Post to Accounting|Disburse loan/i);
});
