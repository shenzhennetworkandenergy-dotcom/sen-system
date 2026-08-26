import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile(
  new URL("../app/admin/receivables/actions.ts", import.meta.url),
  "utf8",
);

test("Phase 5 financial actions reauthorize and call trusted RPCs only", () => {
  for (const action of [
    "postReceivableDisbursementAction",
    "postReceivableRepaymentAction",
    "postReceivableAdjustmentAction",
    "reverseReceivableAccountingAction",
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}`));
  }
  for (const permission of [
    "receivables.disburse",
    "receivables.record_repayment",
    "receivables.adjust",
    "accounting.create_entry",
  ]) {
    assert.match(actions, new RegExp(`requirePermission\\(\\s*[\"']${permission.replace(".", "\\.")}`));
  }
  for (const rpc of [
    "post_receivable_disbursement",
    "post_receivable_repayment",
    "post_receivable_adjustment",
    "reverse_receivable_accounting_posting",
  ]) {
    assert.match(actions, new RegExp(`\\.rpc\\(\\s*[\"']${rpc}`));
  }
  assert.doesNotMatch(actions, /\.from\([\"'](?:journal_entries|journal_lines|cashbook_entries|receivable_transactions)[\"']\)\.(?:insert|update|upsert|delete)/);
});

test("Phase 5 actions keep Sales payment and Payroll out of the posting boundary", () => {
  assert.doesNotMatch(actions, /record_sale_payment|sale_payments/);
  assert.doesNotMatch(actions, /mark_hr_payroll_paid_with_receivables|hr_payroll_records/);
});
