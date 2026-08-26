import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8").catch(() => "");
const [detail, operations, reconciliation, navigation] = await Promise.all([
  read("../app/admin/receivables/loans/[id]/page.tsx"),
  read("../components/receivables/ReceivableOperations.tsx"),
  read("../app/admin/receivables/reconciliation/page.tsx"),
  read("../components/receivables/ReceivablesNavigation.tsx"),
]);

test("Receivable detail exposes Phase 5 posting and reversal status", () => {
  assert.match(detail, /Accounting Status|Posting Status/i);
  assert.match(detail, /Journal Reference|Journal/i);
  assert.match(detail, /Cash Book Reference|Cash Book/i);
  assert.match(detail, /receivableAccountingPostings|accountingPostings/i);
});

test("Receivable operations expose typed accounting actions without changing Phase 3 controls", () => {
  for (const action of [
    "postReceivableDisbursementAction",
    "postReceivableRepaymentAction",
    "postReceivableAdjustmentAction",
    "reverseReceivableAccountingAction",
  ]) {
    assert.match(operations, new RegExp(action));
  }
  assert.match(operations, /Accounting treatment/i);
  assert.match(operations, /Needs Review/i);
  assert.match(operations, /salary_deduction/);
});

test("Reconciliation is permission-protected and read-only", () => {
  assert.match(reconciliation, /requireAllPermissions\(\[[\s\S]*receivables\.view[\s\S]*receivables\.view_loans/);
  assert.match(reconciliation, /receivable_accounting_reconciliation_v/);
  assert.match(reconciliation, /Journal|Cash Book|Posting Status/i);
  assert.doesNotMatch(reconciliation, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("Receivables navigation includes the focused reconciliation view", () => {
  assert.match(navigation, /Reconciliation/i);
  assert.match(navigation, /\/admin\/receivables\/reconciliation/);
});
