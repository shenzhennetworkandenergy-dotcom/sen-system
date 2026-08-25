import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/receivables/data.ts", import.meta.url),
  "utf8",
).catch(() => "");

test("Phase 3 DAL exposes permission-scoped list, detail, installments, transactions, audit, and metrics", () => {
  assert.match(source, /export async function getNonSalesReceivables/);
  assert.match(source, /export async function getNonSalesReceivableDetail/);
  assert.match(source, /non_sales_receivable_details_v/);
  assert.match(source, /receivable_installment_status_v/);
  assert.match(source, /receivable_transactions/);
  assert.match(source, /audit_logs/);
  assert.match(source, /non_sales_receivable_metrics_v/);
  assert.match(source, /canViewLoans/);
  assert.match(source, /\.range\(/);
  assert.match(source, /\.limit\(/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(source, /\.rpc\(/);
});

test("non-Sales list filtering is server-side and bounded", () => {
  for (const field of ["category", "status", "borrowerType", "currency"]) {
    assert.match(source, new RegExp(`filters\\.${field}`));
  }
  assert.match(source, /slice\(0,\s*80\)/);
  assert.match(source, /pageSize/);
  assert.match(source, /\.eq\("receivable_type"/);
  assert.match(source, /\.eq\("receivable_status"/);
  assert.match(source, /\.eq\("party_type"/);
  assert.match(source, /\.eq\("currency"/);
});
