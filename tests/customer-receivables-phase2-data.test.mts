import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mergeCustomerMetricRows,
  mergeCustomerSummaryRows,
  normalizeCustomerReceivablesParams,
} from "../lib/receivables/customer.ts";

const dataSource = await readFile(
  new URL("../lib/receivables/data.ts", import.meta.url),
  "utf8",
).catch(() => "");

test("normalizes authorized server-side search and filters without accepting arbitrary values", () => {
  assert.deepEqual(
    normalizeCustomerReceivablesParams({
      q: "  ABC%, Ltd  ",
      page: "-3",
      pageSize: "1000",
      paymentStatus: "partially_paid",
      receivablesStatus: "overdue",
      agingBucket: "31_60_days_overdue",
      dueFrom: "2026-08-01",
      dueTo: "2026-08-31",
      salesperson: "  Ali  ",
      outstandingOnly: "1",
    }),
    {
      page: 1,
      pageSize: 100,
      search: "ABC Ltd",
      paymentStatus: "partially_paid",
      receivablesStatus: "overdue",
      agingBucket: "31_60_days_overdue",
      dueFrom: "2026-08-01",
      dueTo: "2026-08-31",
      salesperson: "Ali",
      outstandingOnly: true,
    },
  );

  const invalid = normalizeCustomerReceivablesParams({
    paymentStatus: "anything",
    receivablesStatus: "leak",
    agingBucket: "invented",
    dueFrom: "08/01/2026",
    dueTo: "not-a-date",
  });
  assert.equal(invalid.paymentStatus, "");
  assert.equal(invalid.receivablesStatus, "");
  assert.equal(invalid.agingBucket, "");
  assert.equal(invalid.dueFrom, "");
  assert.equal(invalid.dueTo, "");
});

test("customer rollups keep currencies separate and combine only duplicate scoped owners", () => {
  assert.deepEqual(
    mergeCustomerSummaryRows([
      { customerId: "a", customerName: "ABC", companyName: "ABC Ltd", currency: "BDT", totalInvoiced: 100, totalPaid: 20, totalOutstanding: 80, totalOverdue: 30, receivableCount: 1 },
      { customerId: "a", customerName: "ABC", companyName: "ABC Ltd", currency: "BDT", totalInvoiced: 200, totalPaid: 100, totalOutstanding: 100, totalOverdue: 0, receivableCount: 1 },
      { customerId: "a", customerName: "ABC", companyName: "ABC Ltd", currency: "USD", totalInvoiced: 10, totalPaid: 5, totalOutstanding: 5, totalOverdue: 0, receivableCount: 1 },
    ]),
    [
      { customerId: "a", customerName: "ABC", companyName: "ABC Ltd", currency: "BDT", totalInvoiced: 300, totalPaid: 120, totalOutstanding: 180, totalOverdue: 30, receivableCount: 2 },
      { customerId: "a", customerName: "ABC", companyName: "ABC Ltd", currency: "USD", totalInvoiced: 10, totalPaid: 5, totalOutstanding: 5, totalOverdue: 0, receivableCount: 1 },
    ],
  );
});

test("dashboard metrics keep currencies separate while merging authorized owner groups", () => {
  assert.deepEqual(
    mergeCustomerMetricRows([
      { currency: "BDT", customerOutstanding: 100, currentOutstanding: 40, dueToday: 10, dueNext7Days: 20, overdue: 30, noDueDate: 30, collectedThisMonth: 5, recordCount: 2 },
      { currency: "BDT", customerOutstanding: 200, currentOutstanding: 80, dueToday: 0, dueNext7Days: 40, overdue: 60, noDueDate: 20, collectedThisMonth: 10, recordCount: 3 },
      { currency: "USD", customerOutstanding: 9, currentOutstanding: 9, dueToday: 0, dueNext7Days: 0, overdue: 0, noDueDate: 0, collectedThisMonth: 1, recordCount: 1 },
    ]),
    [
      { currency: "BDT", customerOutstanding: 300, currentOutstanding: 120, dueToday: 10, dueNext7Days: 60, overdue: 90, noDueDate: 50, collectedThisMonth: 15, recordCount: 5 },
      { currency: "USD", customerOutstanding: 9, currentOutstanding: 9, dueToday: 0, dueNext7Days: 0, overdue: 0, noDueDate: 0, collectedThisMonth: 1, recordCount: 1 },
    ],
  );
});

test("the service-role DAL applies Sales scope to rows, rollups, and aggregate metrics", () => {
  assert.match(dataSource, /customer_receivables_detail_v/);
  assert.match(dataSource, /customer_receivables_summary_v/);
  assert.match(dataSource, /customer_receivables_metrics_v/);
  assert.match(dataSource, /SalesVisibilityScope/);
  assert.match(dataSource, /responsible_profile_id/);
  assert.match(dataSource, /salesScope\.kind\s*===\s*["']own["']/);
  assert.match(dataSource, /salesScope\.profileId/);
  assert.match(dataSource, /salesScope\.kind\s*===\s*["']none["']/);
  assert.doesNotMatch(dataSource, /getAllViewRows\(["']customer_receivables/);
  assert.doesNotMatch(dataSource, /\.from\(["'](?:sale_payments|journal_entries|cashbook_entries)["']\)\.(?:insert|update|upsert|delete)/);
});
