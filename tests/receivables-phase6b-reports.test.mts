import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAuthoritativeSalesPaymentEvents,
  buildStatementRows,
  classifyCustomerReceivableForReport,
  classifyInstallmentForReport,
  classifyReceivableActivity,
  customerStatementSaleLabel,
  groupAgingTotalsByCurrency,
  normalizeReceivablesReportParams,
  paginateStatementGroups,
  reconciliationReportFieldPolicy,
  sanitizeReportingReversalReference,
  summarizeActivityByCurrency,
} from "../lib/receivables/reports.ts";
import { sanitizeReportingTransaction } from "../lib/receivables/reporting.ts";
import { mergeCustomerSummaryRows } from "../lib/receivables/customer.ts";

const TODAY = "2026-08-31";

test("customer due and aging report boundaries match the Phase 2 business rules", () => {
  const cases = [
    [100, "2026-09-08", "not_yet_due", "not_yet_due", null],
    [100, "2026-09-07", "due_soon", "not_yet_due", null],
    [100, TODAY, "due_today", "due_today", 0],
    [100, "2026-08-30", "overdue", "1_30_days_overdue", 1],
    [100, "2026-08-01", "overdue", "1_30_days_overdue", 30],
    [100, "2026-07-31", "overdue", "31_60_days_overdue", 31],
    [100, "2026-07-02", "overdue", "31_60_days_overdue", 60],
    [100, "2026-07-01", "overdue", "61_90_days_overdue", 61],
    [100, "2026-06-02", "overdue", "61_90_days_overdue", 90],
    [100, "2026-06-01", "overdue", "90_plus_days_overdue", 91],
    [100, null, "no_due_date", "no_due_date", null],
    [0, "2026-01-01", "paid", "paid", null],
  ] as const;

  for (const [outstandingAmount, dueDate, dueStatus, agingBucket, daysOverdue] of cases) {
    assert.deepEqual(
      classifyCustomerReceivableForReport({ outstandingAmount, dueDate, today: TODAY }),
      { dueStatus, agingBucket, daysOverdue },
    );
  }
});

test("aging totals remain currency-separated and exclude paid balances", () => {
  assert.deepEqual(
    groupAgingTotalsByCurrency([
      { currency: "BDT", agingBucket: "1_30_days_overdue", outstandingAmount: 100 },
      { currency: "bdt", agingBucket: "no_due_date", outstandingAmount: 50 },
      { currency: "USD", agingBucket: "1_30_days_overdue", outstandingAmount: 10 },
      { currency: "XZZ", agingBucket: "paid", outstandingAmount: 0 },
    ]),
    [
      {
        currency: "BDT",
        totalOutstanding: 150,
        buckets: { "1_30_days_overdue": 100, no_due_date: 50 },
      },
      {
        currency: "USD",
        totalOutstanding: 10,
        buckets: { "1_30_days_overdue": 10 },
      },
    ],
  );
});

test("customer rollups merge owner-split rows without crossing currencies", () => {
  assert.deepEqual(
    mergeCustomerSummaryRows([
      { customerId: "customer-1", customerName: "ABC", companyName: "ABC Ltd", currency: "BDT", totalInvoiced: 100, totalPaid: 40, totalOutstanding: 60, totalOverdue: 10, receivableCount: 1 },
      { customerId: "customer-1", customerName: "ABC", companyName: "ABC Ltd", currency: "bdt", totalInvoiced: 50, totalPaid: 20, totalOutstanding: 30, totalOverdue: 5, receivableCount: 1 },
      { customerId: "customer-1", customerName: "ABC", companyName: "ABC Ltd", currency: "USD", totalInvoiced: 25, totalPaid: 0, totalOutstanding: 25, totalOverdue: 0, receivableCount: 1 },
    ]),
    [
      { customerId: "customer-1", customerName: "ABC", companyName: "ABC Ltd", currency: "BDT", totalInvoiced: 150, totalPaid: 60, totalOutstanding: 90, totalOverdue: 15, receivableCount: 2 },
      { customerId: "customer-1", customerName: "ABC", companyName: "ABC Ltd", currency: "USD", totalInvoiced: 25, totalPaid: 0, totalOutstanding: 25, totalOverdue: 0, receivableCount: 1 },
    ],
  );
});

test("customer statements keep invoice, payment, and authoritative refund events separate", () => {
  const rows = buildStatementRows([
    { id: "invoice", date: "2026-08-01", type: "invoice", direction: "increase", amount: 500, currency: "BDT" },
    { id: "payment-1", date: "2026-08-10", type: "payment", direction: "decrease", amount: 200, currency: "BDT" },
    { id: "payment-2", date: "2026-08-20", type: "payment", direction: "decrease", amount: 100, currency: "BDT" },
    { id: "refund", date: "2026-08-25", type: "refund", direction: "increase", amount: 50, currency: "BDT" },
  ]);
  assert.deepEqual(rows.map((row) => [row.id, row.runningBalance]), [
    ["invoice", 500],
    ["payment-1", 300],
    ["payment-2", 200],
    ["refund", 250],
  ]);
  assert.throws(
    () => buildStatementRows([
      { id: "a", date: "2026-08-01", type: "invoice", direction: "increase", amount: 1, currency: "BDT" },
      { id: "b", date: "2026-08-02", type: "invoice", direction: "increase", amount: 1, currency: "USD" },
    ]),
    /currency/i,
  );
  assert.throws(
    () => buildStatementRows([
      { id: "missing-currency", date: "2026-08-01", type: "invoice", direction: "increase", amount: 1, currency: "" },
    ]),
    /currency/i,
  );
});

test("customer statement pagination applies one bounded page across currency groups", () => {
  const firstPage = paginateStatementGroups([
    { currency: "BDT", rows: ["bdt-1", "bdt-2", "bdt-3"] },
    { currency: "USD", rows: ["usd-1", "usd-2"] },
  ], 1, 2);
  assert.equal(firstPage.totalRows, 5);
  assert.equal(firstPage.hasNextPage, true);
  assert.equal(firstPage.groups.reduce((total, group) => total + group.rows.length, 0), 2);
  assert.deepEqual(firstPage.groups.map((group) => [group.currency, group.rows]), [
    ["BDT", ["bdt-1", "bdt-2"]],
    ["USD", []],
  ]);

  const secondPage = paginateStatementGroups([
    { currency: "BDT", rows: ["bdt-1", "bdt-2", "bdt-3"] },
    { currency: "USD", rows: ["usd-1", "usd-2"] },
  ], 2, 2);
  assert.equal(secondPage.hasNextPage, true);
  assert.equal(secondPage.groups.reduce((total, group) => total + group.rows.length, 0), 2);
  assert.deepEqual(secondPage.groups.map((group) => [group.currency, group.rows]), [
    ["BDT", ["bdt-3"]],
    ["USD", ["usd-1"]],
  ]);
});

test("customer statement labels distinguish uninvoiced Sales from invoice-backed Sales", () => {
  assert.equal(customerStatementSaleLabel(null, null), "Sale (not invoiced)");
  assert.equal(customerStatementSaleLabel("", ""), "Sale (not invoiced)");
  assert.equal(customerStatementSaleLabel("INV-001", null), "Invoice");
  assert.equal(customerStatementSaleLabel(null, "2026-08-31"), "Invoice");
});

test("Sales refund presentation is capped to the authoritative net payment effect", () => {
  const events = buildAuthoritativeSalesPaymentEvents([
    { id: "received-1", saleId: "sale-1", date: "2026-08-01", status: "received", amount: 200, method: "bank" },
    { id: "received-2", saleId: "sale-1", date: "2026-08-05", status: "received", amount: 100, method: "cash" },
    { id: "refund-1", saleId: "sale-1", date: "2026-08-10", status: "refunded", amount: 50, method: "bank" },
    // A legacy row whose status was changed in place must not make the
    // statement exceed the source-of-truth net paid amount.
    { id: "legacy-refund", saleId: "sale-2", date: "2026-08-11", status: "refunded", amount: 75, method: "cash" },
    { id: "unverified-refund", saleId: "sale-3", date: "2026-08-12", status: "refunded", amount: 40, method: "cash" },
  ], new Map([
    ["sale-1", 250],
    ["sale-2", 0],
  ]));
  assert.deepEqual(events.map((event) => [event.id, event.type, event.amount]), [
    ["received-1", "payment", 200],
    ["received-2", "payment", 100],
    ["refund-1", "refund", 50],
  ]);
  assert.equal(events.some((event) => event.id === "unverified-refund"), false);
});

test("non-Sales statements preserve historical opening and immutable reversal events", () => {
  const rows = buildStatementRows([
    { id: "opening", date: "2026-08-01", type: "opening_balance", direction: "increase", amount: 80, currency: "BDT" },
    { id: "repayment", date: "2026-08-10", type: "repayment", direction: "decrease", amount: 20, currency: "BDT" },
    { id: "reversal", date: "2026-08-11", type: "reversal", direction: "increase", amount: 20, currency: "BDT", reversalOfId: "repayment" },
    { id: "adjustment", date: "2026-08-20", type: "adjustment_decrease", direction: "decrease", amount: 10, currency: "BDT" },
  ]);
  assert.equal(rows[0]?.label, "Historical Opening Balance");
  assert.equal(rows[0]?.periodClass, "opening");
  assert.equal(rows[2]?.label, "Reversal");
  assert.equal(rows[2]?.reversalOfId, "repayment");
  assert.equal(rows.at(-1)?.runningBalance, 70);
});

test("installment report preserves FIFO-derived amounts and renders current date states", () => {
  assert.equal(classifyInstallmentForReport({ status: "paid", dueDate: "2026-08-01", paidAmount: 100, remainingAmount: 0, today: TODAY }), "paid");
  assert.equal(classifyInstallmentForReport({ status: "partial", dueDate: "2026-09-01", paidAmount: 20, remainingAmount: 80, today: TODAY }), "partial");
  assert.equal(classifyInstallmentForReport({ status: "overdue", dueDate: "2026-08-30", paidAmount: 20, remainingAmount: 80, today: TODAY }), "overdue");
  assert.equal(classifyInstallmentForReport({ status: "unpaid", dueDate: TODAY, paidAmount: 0, remainingAmount: 100, today: TODAY }), "due_today");
  assert.equal(classifyInstallmentForReport({ status: "unpaid", dueDate: "2026-09-01", paidAmount: 0, remainingAmount: 100, today: TODAY }), "upcoming");
});

test("activity reports distinguish collections, repayments, adjustments, and reversals", () => {
  assert.equal(classifyReceivableActivity({ sourceType: "customer_sale", transactionType: "payment", status: "received" }), "customer_collection");
  assert.equal(classifyReceivableActivity({ sourceType: "customer_sale", transactionType: "refund", status: "refunded" }), "customer_refund");
  assert.equal(classifyReceivableActivity({ sourceType: "non_sales", transactionType: "repayment" }), "non_sales_repayment");
  assert.equal(classifyReceivableActivity({ sourceType: "non_sales", transactionType: "adjustment_decrease" }), "non_cash_adjustment");
  assert.equal(classifyReceivableActivity({ sourceType: "non_sales", transactionType: "reversal" }), "reversal");

  assert.deepEqual(
    summarizeActivityByCurrency([
      { currency: "BDT", kind: "customer_collection", amount: 50 },
      { currency: "BDT", kind: "non_sales_repayment", amount: 25 },
      { currency: "BDT", kind: "non_cash_adjustment", amount: 10 },
      { currency: "USD", kind: "customer_collection", amount: 5 },
    ]),
    [
      { currency: "BDT", customerCollections: 50, nonSalesRepayments: 25, adjustments: 10, refunds: 0 },
      { currency: "USD", customerCollections: 5, nonSalesRepayments: 0, adjustments: 0, refunds: 0 },
    ],
  );
  assert.deepEqual(
    summarizeActivityByCurrency([
      { currency: "BDT", kind: "non_sales_opening", amount: 100 },
      { currency: "BDT", kind: "non_sales_disbursement", amount: 50 },
    ]),
    [{
      currency: "BDT",
      customerCollections: 0,
      nonSalesRepayments: 0,
      adjustments: 0,
      refunds: 0,
      openingBalances: 100,
      disbursements: 50,
    }],
  );
});

test("Phase 6B report filters are validated, bounded, and use Dhaka half-open ranges", () => {
  const params = normalizeReceivablesReportParams({
    q: "  ABC% (Ltd) ",
    page: "0",
    pageSize: "1000",
    currency: "usd",
    from: "2026-08-31",
    to: "2026-08-31",
    dueStatus: "overdue",
    agingBucket: "31_60_days_overdue",
    source: "non_sales_repayment",
  });
  assert.equal(params.page, 1);
  assert.equal(params.pageSize, 100);
  assert.equal(params.currency, "USD");
  assert.equal(params.search, "ABC Ltd");
  assert.equal(params.dateRange.startUtc, "2026-08-30T18:00:00.000Z");
  assert.equal(params.dateRange.endUtc, "2026-08-31T18:00:00.000Z");
  assert.equal(params.dueStatus, "overdue");
  assert.equal(params.agingBucket, "31_60_days_overdue");
  assert.equal(params.source, "non_sales_repayment");
  assert.equal(params.dueFrom, null);
  assert.equal(params.dueTo, null);
  assert.equal(normalizeReceivablesReportParams({ dueStatus: "not-valid" }).dueStatus, "");
});

test("accounting-hidden reporting masks accounting aliases before they reach report DTOs", () => {
  const hidden = sanitizeReportingTransaction({
    id: "tx-alias",
    transaction_type: "repayment",
    direction: "decrease",
    amount: 10,
    effective_date: "2026-08-31",
    payment_method: "cashbook",
    source: "posting",
    operation_id: "sensitive-operation",
    notes: "journal entry JE-1",
  }, { canViewAccountingDetails: false, canViewPayrollDetails: true });
  assert.equal(hidden.source, "financial-linked");
  assert.equal(hidden.paymentMethod, "financial-linked");
  assert.equal(hidden.operationId, "financial-linked");
  assert.equal(hidden.notes, null);
});

test("accounting-only viewers receive ordinary reconciliation references while payroll-linked rows stay excluded", () => {
  assert.deepEqual(reconciliationReportFieldPolicy({
    canViewAccountingDetails: true,
    canViewPayrollDetails: false,
  }), {
    includeAccountingReferences: true,
    excludePayrollLinkedRows: true,
  });
  assert.deepEqual(reconciliationReportFieldPolicy({
    canViewAccountingDetails: false,
    canViewPayrollDetails: false,
  }), {
    includeAccountingReferences: false,
    excludePayrollLinkedRows: true,
  });
});

test("reversal references inherit protected classification from their original movement", () => {
  // Phase 3 reversal rows can be emitted with a generic/manual source while
  // the original movement is Payroll or Accounting-linked.  The report layer
  // must not expose that original identifier to a viewer lacking the matching
  // detail authority.
  assert.equal(sanitizeReportingReversalReference({
    reversalOfId: "payroll-tx",
    source: "manual",
    paymentMethod: "other",
    relatedSource: "payroll",
    relatedPaymentMethod: "salary_deduction",
    canViewAccountingDetails: true,
    canViewPayrollDetails: false,
  }), null);
  assert.equal(sanitizeReportingReversalReference({
    reversalOfId: "accounting-tx",
    source: "manual",
    relatedSource: "accounting",
    canViewAccountingDetails: false,
    canViewPayrollDetails: true,
  }), null);
  assert.equal(sanitizeReportingReversalReference({
    reversalOfId: "ordinary-tx",
    source: "manual",
    relatedSource: "manual",
    canViewAccountingDetails: false,
    canViewPayrollDetails: false,
  }), "ordinary-tx");
  assert.equal(sanitizeReportingReversalReference({
    reversalOfId: "cashbook-tx",
    source: "manual",
    relatedSource: "cash_book",
    canViewAccountingDetails: false,
    canViewPayrollDetails: true,
  }), null);
});

test("Phase 6B routes are read-only and use the centralized reporting boundary", async () => {
  const data = await readFile(new URL("../lib/receivables/reports-data.ts", import.meta.url), "utf8").catch(() => "");
  const navigation = await readFile(new URL("../components/receivables/ReceivablesNavigation.tsx", import.meta.url), "utf8");
  assert.match(data, /import\s+["']server-only["']/);
  assert.match(data, /ReceivablesReportScope/);
  assert.match(data, /salesScope\.kind\s*===\s*["']own["']/);
  assert.match(data, /canViewAccountingDetails/);
  assert.match(data, /canViewPayrollDetails/);
  assert.match(data, /\.range\(/);
  assert.doesNotMatch(data, /\.(?:insert|update|upsert|delete|rpc)\(/);
  assert.match(navigation, /Reports/);
  assert.match(data, /SAFE_RECONCILIATION_COLUMNS/);
  assert.match(data, /reconciliationColumnsForReport/);
  assert.match(data, /excludePayrollLinkedReconciliationRows/);
  assert.match(data, /canViewAccountingDetails\s*&&\s*access\.canViewPayrollDetails/);
  assert.match(data, /hasNextPage/);

  for (const relative of [
    "../app/admin/receivables/reports/page.tsx",
    "../app/admin/receivables/reports/customers/page.tsx",
    "../app/admin/receivables/reports/customers/[customerId]/page.tsx",
    "../app/admin/receivables/reports/non-sales/page.tsx",
    "../app/admin/receivables/reports/non-sales/[accountId]/page.tsx",
    "../app/admin/receivables/reports/installments/page.tsx",
    "../app/admin/receivables/reports/activity/page.tsx",
  ]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8").catch(() => "");
    assert.match(source, /resolveReceivablesReportScope/);
  }
});
