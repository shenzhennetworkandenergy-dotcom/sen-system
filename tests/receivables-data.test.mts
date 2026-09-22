import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { summarizeReceivablesRows } from "../lib/receivables/summary.ts";

const sourceUrl = new URL("../lib/receivables/data.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8").catch(() => "");

test("the DAL is server-only, permission-scoped, paginated, and read-only", () => {
  assert.match(source, /import\s+["']server-only["']/);
  assert.match(source, /export async function getReceivablesDashboard/);
  assert.match(source, /export async function getCustomerReceivables/);
  assert.match(source, /export async function getNonSalesReceivables/);
  assert.match(source, /export async function getReceivablePartyOptions/);
  assert.match(source, /canViewCustomer/);
  assert.match(source, /canViewLoans/);
  assert.match(source, /customer_receivables_v/);
  assert.match(source, /non_sales_receivables_v/);
  assert.match(source, /\.range\(/);
  assert.match(source, /slice\(0,\s*80\)/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(source, /\.rpc\(/);
});

test("dashboard summaries keep currencies separate and include only provided rows", () => {
  const result = summarizeReceivablesRows(
    [
      {
        sourceType: "customer_sale",
        sourceId: "sale-a",
        currency: "BDT",
        outstandingAmount: 300000,
        dueDate: null,
        lastActivityDate: "2026-08-20",
      },
      {
        sourceType: "non_sales",
        sourceId: "loan-a",
        currency: "BDT",
        outstandingAmount: 80000,
        dueDate: "2026-08-25",
        lastActivityDate: "2026-08-24",
      },
      {
        sourceType: "non_sales",
        sourceId: "advance-usd",
        currency: "USD",
        outstandingAmount: 1000,
        dueDate: "2026-08-24",
        lastActivityDate: "2026-08-23",
      },
    ],
    "2026-08-25",
  );

  assert.deepEqual(result.byCurrency, [
    {
      currency: "BDT",
      totalOutstanding: 380000,
      customerOutstanding: 300000,
      nonSalesOutstanding: 80000,
      dueToday: 80000,
      dueThisWeek: 80000,
      overdue: 0,
      recordCount: 2,
    },
    {
      currency: "USD",
      totalOutstanding: 1000,
      customerOutstanding: 0,
      nonSalesOutstanding: 1000,
      dueToday: 0,
      dueThisWeek: 0,
      overdue: 1000,
      recordCount: 1,
    },
  ]);
  assert.deepEqual(
    result.recent.map((row) => row.sourceId),
    ["loan-a", "advance-usd", "sale-a"],
  );
});

test("zero and negative operational balances are excluded from exposure", () => {
  const result = summarizeReceivablesRows(
    [
      {
        sourceType: "customer_sale",
        sourceId: "paid",
        currency: "BDT",
        outstandingAmount: 0,
        dueDate: "2026-08-01",
        lastActivityDate: "2026-08-25",
      },
      {
        sourceType: "non_sales",
        sourceId: "corrected",
        currency: "BDT",
        outstandingAmount: -10,
        dueDate: "2026-08-01",
        lastActivityDate: "2026-08-25",
      },
    ],
    "2026-08-25",
  );

  assert.equal(result.byCurrency[0]?.totalOutstanding ?? 0, 0);
  assert.equal(result.byCurrency[0]?.overdue ?? 0, 0);
});
