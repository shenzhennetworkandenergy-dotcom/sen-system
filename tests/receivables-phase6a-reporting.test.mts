import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  REPORT_MAX_PAGE_SIZE,
  groupReportingAmountsByCurrency,
  normalizeDhakaDateRange,
  normalizeReportingListParams,
  normalizeReportingSearch,
  normalizeReportingScope,
  sanitizeReportingAccountingLink,
  sanitizeReportingMetadata,
  sanitizeReportingRepaymentMethod,
  sanitizeReportingAuditEntry,
  sanitizeReportingText,
  sanitizeReportingTransaction,
} from "../lib/receivables/reporting.ts";

const activeEmployee = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "employee",
  status: "active",
  archived_at: null,
};
const activeAdmin = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "admin",
  status: "active",
  archived_at: null,
};

test("central reporting scope preserves Admin, Sales all/own, loan, accounting, and payroll boundaries", () => {
  const admin = normalizeReportingScope({ profile: activeAdmin, permissions: new Set() });
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.canViewReceivables, true);
  assert.equal(admin.canViewCustomerReceivables, true);
  assert.equal(admin.canViewLoans, true);
  assert.equal(admin.canViewAccountingDetails, true);
  assert.equal(admin.canViewPayrollDetails, true);
  assert.deepEqual(admin.salesScope, { kind: "all" });

  const allSales = normalizeReportingScope({
    profile: activeEmployee,
    permissions: new Set(["receivables.view", "receivables.view_customer", "sales.view"]),
  });
  assert.deepEqual(allSales.salesScope, { kind: "all" });
  assert.equal(allSales.canViewCustomerReceivables, true);
  assert.equal(allSales.canViewLoans, false);
  assert.equal(allSales.canViewPayrollDetails, false);

  const ownSales = normalizeReportingScope({
    profile: activeEmployee,
    permissions: new Set(["receivables.view", "receivables.view_customer", "sales.view_own"]),
  });
  assert.deepEqual(ownSales.salesScope, { kind: "own", profileId: activeEmployee.id });
  assert.equal(ownSales.canViewCustomerReceivables, true);

  const loanViewer = normalizeReportingScope({
    profile: activeEmployee,
    permissions: new Set(["receivables.view", "receivables.view_loans"]),
  });
  assert.equal(loanViewer.canViewLoans, true);
  assert.equal(loanViewer.canViewAccountingDetails, false);
  assert.equal(loanViewer.canViewPayrollDetails, false);

  const accountingViewer = normalizeReportingScope({
    profile: activeEmployee,
    permissions: new Set(["receivables.view", "receivables.view_loans", "accounting.view"]),
  });
  assert.equal(accountingViewer.canViewAccountingDetails, true);
  assert.equal(accountingViewer.canViewPayrollDetails, false);

  const noSalesView = normalizeReportingScope({
    profile: activeEmployee,
    permissions: new Set(["receivables.view", "receivables.view_customer"]),
  });
  assert.equal(noSalesView.canViewCustomerReceivables, false);
  assert.deepEqual(noSalesView.salesScope, { kind: "none" });
});

test("inactive or archived profiles cannot use an Admin bypass", () => {
  const inactive = normalizeReportingScope({
    profile: { ...activeAdmin, status: "inactive" },
    permissions: new Set(),
  });
  assert.equal(inactive.canViewReceivables, false);
  assert.equal(inactive.canViewPayrollDetails, false);

  const archived = normalizeReportingScope({
    profile: { ...activeAdmin, archived_at: "2026-08-30T00:00:00.000Z" },
    permissions: new Set(),
  });
  assert.equal(archived.isAdmin, false);
  assert.equal(archived.canViewReceivables, false);
  assert.equal(archived.canViewPayrollDetails, false);

  const missingArchiveState = normalizeReportingScope({
    profile: { id: activeAdmin.id, role: "admin", status: "active" },
    permissions: new Set(),
  });
  assert.equal(missingArchiveState.isAdmin, false);
  assert.equal(missingArchiveState.canViewReceivables, false);

  const permissionOnly = normalizeReportingScope({
    profile: activeEmployee,
    permissions: new Set(["receivables.view_loans", "hr.view_payroll"]),
  });
  assert.equal(permissionOnly.canViewLoans, false);
  assert.equal(permissionOnly.canViewPayrollDetails, false);
});

test("Dhaka report date ranges are inclusive calendar dates and half-open UTC bounds", () => {
  const range = normalizeDhakaDateRange({ from: "2026-08-31", to: "2026-09-02" });
  assert.deepEqual(range, {
    fromDate: "2026-08-31",
    toDate: "2026-09-02",
    startUtc: "2026-08-30T18:00:00.000Z",
    endUtc: "2026-09-02T18:00:00.000Z",
  });
  assert.deepEqual(normalizeDhakaDateRange({ from: undefined, to: "2026-09-02" }), {
    fromDate: null,
    toDate: "2026-09-02",
    startUtc: null,
    endUtc: "2026-09-02T18:00:00.000Z",
  });
  assert.throws(() => normalizeDhakaDateRange({ from: "2026-02-31", to: "2026-03-01" }), /valid/i);
  assert.throws(() => normalizeDhakaDateRange({ from: "2026-09-03", to: "2026-09-02" }), /before|range/i);
});

test("currency grouping never combines unlike currencies or assumes BDT", () => {
  assert.deepEqual(
    groupReportingAmountsByCurrency([
      { currency: "bdt", amount: 100 },
      { currency: "BDT", amount: 25 },
      { currency: "USD", amount: 10 },
      { currency: "xzz", amount: 7 },
    ]),
    [
      { currency: "BDT", total: 125, count: 2 },
      { currency: "USD", total: 10, count: 1 },
      { currency: "XZZ", total: 7, count: 1 },
    ],
  );
  assert.throws(() => groupReportingAmountsByCurrency([{ currency: "BD", amount: 1 }]), /currency/i);
});

test("reporting pagination and search are bounded and neutralize query wildcards", () => {
  const params = normalizeReportingListParams({
    q: "  100%_loan (test),. ",
    page: "-2",
    pageSize: "99999",
    currency: "usd",
    dueFrom: "2026-08-01",
    dueTo: "2026-08-31",
  });
  assert.equal(params.page, 1);
  assert.equal(params.pageSize, REPORT_MAX_PAGE_SIZE);
  assert.equal(params.search.includes("%"), false);
  assert.equal(params.search.includes("_"), false);
  assert.equal(params.currency, "USD");
  assert.equal(params.dueFrom, "2026-08-01");
  assert.equal(params.dueTo, "2026-08-31");
  assert.equal(normalizeReportingSearch("x".repeat(200)).length, 80);
  assert.throws(() => normalizeReportingListParams({ dueFrom: "2026-09-01", dueTo: "2026-08-01" }), /range|before/i);
});

test("reporting sanitization removes protected accounting/payroll metadata but preserves operational facts", () => {
  const raw = {
    operation_id: "op-1",
    journal_entry_id: "journal-1",
    cashbook_entry_id: "cash-1",
    payroll_record_id: "payroll-1",
    "journal-entry-id": "journal-2",
    "salary deduction": "salary-2",
    nested: { accounting_treatment: "cash_recovery", payroll_link_id: "link-1", safe: "yes" },
  };
  const hidden = sanitizeReportingMetadata(raw, {
    canViewAccountingDetails: false,
    canViewPayrollDetails: false,
  });
  assert.deepEqual(hidden, { operation_id: "op-1", nested: { safe: "yes" } });
  assert.equal(sanitizeReportingRepaymentMethod("salary_deduction", { canViewPayrollDetails: false }), "payroll-linked");
  assert.equal(sanitizeReportingRepaymentMethod("salary-deduction", { canViewPayrollDetails: false }), "payroll-linked");
  assert.equal(sanitizeReportingRepaymentMethod("bank", { canViewPayrollDetails: false }), "bank");
  const valueHidden = sanitizeReportingMetadata({ innocent: "Payroll salary deduction ref" }, {
    canViewAccountingDetails: false,
    canViewPayrollDetails: false,
  });
  assert.deepEqual(valueHidden, {});
  assert.equal(sanitizeReportingText("without Accounting posting; Journal ID: JE-123", {
    canViewAccountingDetails: false,
    canViewPayrollDetails: false,
  }), null);
  for (const protectedValue of [
    "journal_id",
    "journalEntryId",
    "JOURNAL_ENTRY_ID",
    "JOURNAL",
    "accounting_treatment",
    "posting_id",
    "cashbook_entry",
    "CASHBOOK_ENTRY_ID",
    "payroll_record",
    "payrollRecordId",
    "PAYROLL_RECORD_ID",
    "PAYROLL",
    "gross_pay",
    "GROSS_PAY",
    "net_pay",
    "SALARY_DEDUCTION",
  ]) {
    assert.equal(sanitizeReportingText(protectedValue, {
      canViewAccountingDetails: false,
      canViewPayrollDetails: false,
    }), null);
  }

  const transaction = sanitizeReportingTransaction({
    id: "tx-1",
    transactionType: "repayment",
    direction: "decrease",
    amount: 10,
    effectiveDate: "2026-08-31",
    paymentMethod: "salary_deduction",
    source: "payroll",
    operationId: "op-1",
    reversalOfTransactionId: null,
    notes: "operational",
    metadata: raw,
    createdBy: "actor-1",
    createdAt: "2026-08-31T00:00:00Z",
  }, { canViewAccountingDetails: false, canViewPayrollDetails: false });
  assert.equal(transaction.source, "payroll-linked");
  assert.equal(transaction.paymentMethod, "payroll-linked");
  assert.equal("payroll_record_id" in transaction.metadata, false);
  assert.equal("journal_entry_id" in transaction.metadata, false);
  assert.equal("journal-entry-id" in transaction.metadata, false);
  assert.equal("salary deduction" in transaction.metadata, false);
  assert.equal(transaction.reversalOfTransactionId, null);

  const spoofedSalaryMethod = sanitizeReportingTransaction({
    id: "tx-spoof",
    transaction_type: "repayment",
    direction: "decrease",
    amount: 10,
    effective_date: "2026-08-31",
    payment_method: "salary-deduction",
    source: "manual",
    operation_id: "op-spoof",
  }, { canViewAccountingDetails: false, canViewPayrollDetails: false });
  assert.equal(spoofedSalaryMethod.paymentMethod, "payroll-linked");

  const accountingTransaction = sanitizeReportingTransaction({
    id: "tx-2",
    transaction_type: "disbursement",
    direction: "increase",
    amount: 100,
    effective_date: "2026-08-31",
    payment_method: "bank",
    source: "accounting",
    operation_id: "op-accounting",
    notes: "journal posting committed",
  }, { canViewAccountingDetails: false, canViewPayrollDetails: false });
  assert.equal(accountingTransaction.source, "financial-linked");
  assert.equal(accountingTransaction.operationId, "financial-linked");
  assert.equal(accountingTransaction.notes, null);

  assert.equal(sanitizeReportingAuditEntry({
    id: "audit-1",
    action: "receivables.accounting_posted",
    description: "Journal committed",
  }, { canViewAccountingDetails: false, canViewPayrollDetails: false }), null);
  const operationalAudit = sanitizeReportingAuditEntry({
    id: "audit-2",
    action: "receivables.repayment_recorded",
    description: "Receivable repayment recorded without Accounting posting.",
  }, { canViewAccountingDetails: false, canViewPayrollDetails: false });
  assert.equal(operationalAudit?.description, "Receivable repayment recorded without Accounting posting.");

  for (const protectedAuditDescription of ["journalEntryId=JE-1", "payrollRecordId=PR-1", "cashBookEntryId=CB-1", "grossPay=40000", "JOURNAL_ENTRY_ID=JE-2", "PAYROLL_RECORD_ID=PR-2"]) {
    assert.equal(sanitizeReportingAuditEntry({
      id: `audit-${protectedAuditDescription}`,
      action: "receivables.note",
      description: protectedAuditDescription,
    }, { canViewAccountingDetails: false, canViewPayrollDetails: false }), null);
  }

  const accountingViewerPayrollLink = sanitizeReportingAccountingLink({
    source: "payroll",
    payment_method: "salary_deduction",
    notes: "Payroll salary deduction",
  }, { canViewPayrollDetails: false });
  assert.deepEqual(accountingViewerPayrollLink, {
    source: "payroll-linked",
    paymentMethod: "payroll-linked",
    notes: null,
  });
});

test("Receivables DAL and routes consume the centralized security contract before protected reads", async () => {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [data, detail, reconciliation, dashboard, customers, loans, operations] = await Promise.all([
    read("../lib/receivables/data.ts"),
    read("../app/admin/receivables/loans/[id]/page.tsx"),
    read("../app/admin/receivables/reconciliation/page.tsx"),
    read("../app/admin/receivables/page.tsx"),
    read("../app/admin/receivables/customers/page.tsx"),
    read("../app/admin/receivables/loans/page.tsx"),
    read("../components/receivables/ReceivableOperations.tsx"),
  ]);
  assert.match(data, /canViewAccountingDetails/);
  assert.match(data, /canViewPayrollDetails/);
  assert.match(data, /if\s*\([^)]*canViewAccountingDetails/);
  assert.match(data, /sanitizeReportingMetadata|sanitizeReportingTransaction/);
  assert.match(data, /select\(transactionColumns\)/);
  assert.match(data, /if\s*\(access\.canViewAccountingDetails\)/);
  assert.match(data, /receivable_installment_status_v[\s\S]*?\.limit\(500\)/);
  assert.match(detail, /resolveReceivablesReportScope/);
  assert.match(detail, /canViewAccountingDetails/);
  assert.match(detail, /accountingPostings/);
  assert.match(detail, /const operationAccount = \{/);
  assert.match(detail, /account=\{operationAccount\}/);
  assert.match(reconciliation, /resolveReceivablesReportScope/);
  assert.match(dashboard, /resolveReceivablesReportScope/);
  assert.match(customers, /resolveReceivablesReportScope/);
  assert.match(loans, /resolveReceivablesReportScope/);
  assert.doesNotMatch(detail, /getNonSalesReceivableDetail\(id,\s*\{\s*canViewLoans:\s*true/);
  assert.match(operations, /canViewAccountingDetails/);
  assert.match(operations, /isProtectedSource\(transaction\.source\)/);
  assert.match(operations, /payroll-linked/);
  assert.match(operations, /["']accounting["']/);
  assert.match(operations, /canViewAccountingDetails/);
});
