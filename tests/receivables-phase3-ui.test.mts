import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8").catch(() => "");
const [loans, detail, operations, dashboard] = await Promise.all([
  read("../app/admin/receivables/loans/page.tsx"),
  read("../app/admin/receivables/loans/[id]/page.tsx"),
  read("../components/receivables/ReceivableOperations.tsx"),
  read("../app/admin/receivables/page.tsx"),
]);

test("Loans page exposes bounded filters, detail links, and approved Phase 3 categories", () => {
  assert.match(loans, /name="category"/);
  assert.match(loans, /name="status"/);
  assert.match(loans, /name="borrowerType"/);
  assert.match(loans, /name="currency"/);
  assert.match(loans, /\/admin\/receivables\/loans\/\$\{row\.sourceId\}/);
  assert.match(loans, /Phase 3 operational/i);
});

test("detail route is permission protected and displays immutable operational truth", () => {
  assert.match(detail, /requireAllPermissions\(\[[\s\S]*receivables\.view[\s\S]*receivables\.view_loans/);
  assert.match(detail, /getNonSalesReceivableDetail/);
  assert.match(detail, /Installment Schedule/);
  assert.match(detail, /Immutable Transaction History/);
  assert.match(detail, /Audit Activity/);
  assert.match(
    detail,
    /Accounting posting not yet automated|Phase 5 accounting posting is available/i,
  );
  assert.match(detail, /ReceivableOperations/);
});

test("operation forms are native, accessible, permission-aware and preserve Phase 4 and 5 boundaries", () => {
  assert.match(operations, /^\s*["']use client["']/);
  assert.match(operations, /useActionState/);
  for (const action of [
    "transitionReceivableAction",
    "updateReceivableScheduleAction",
    "confirmReceivableDisbursementAction",
    "recordReceivableRepaymentAction",
    "recordReceivableAdjustmentAction",
    "reverseReceivableTransactionAction",
  ]) {
    assert.match(operations, new RegExp(action));
  }
  assert.match(operations, /canApprove/);
  assert.match(operations, /canDisburse/);
  assert.match(operations, /canRecordRepayment/);
  assert.match(operations, /canAdjust/);
  assert.doesNotMatch(operations, /value="salary_deduction"/);
  assert.doesNotMatch(operations, /Post to Accounting|Post to Cash Book/);
});

test("dashboard renders currency-separated Phase 3 category and recovery metrics", () => {
  assert.match(dashboard, /loanMetrics/);
  assert.match(dashboard, /Recovered \/ adjusted this month/);
  assert.match(dashboard, /category/);
});
