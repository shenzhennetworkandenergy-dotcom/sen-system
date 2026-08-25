import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile(
  new URL("../app/admin/receivables/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");

test("Phase 3 server actions reauthorize every sensitive operation and call only RPCs", () => {
  for (const action of [
    "updateReceivableScheduleAction",
    "transitionReceivableAction",
    "confirmReceivableDisbursementAction",
    "recordReceivableRepaymentAction",
    "recordReceivableAdjustmentAction",
    "reverseReceivableTransactionAction",
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}`));
  }
  for (const permission of [
    "receivables.create",
    "receivables.approve",
    "receivables.disburse",
    "receivables.record_repayment",
    "receivables.adjust",
  ]) {
    assert.match(actions, new RegExp(`requirePermission\\(\"${permission.replace(".", "\\.")}\"\\)`));
  }
  for (const rpc of [
    "set_receivable_installment_schedule",
    "transition_receivable_account",
    "confirm_receivable_disbursement",
    "record_receivable_repayment",
    "record_receivable_adjustment",
    "reverse_receivable_transaction",
  ]) {
    assert.match(actions, new RegExp(`\\.rpc\\(\\s*\"${rpc}\"`));
  }
  assert.match(actions, /normalizeDisbursementInput/);
  assert.match(actions, /normalizeRepaymentInput/);
  assert.match(actions, /normalizeAdjustmentInput/);
  assert.match(actions, /normalizeReversalInput/);
  assert.doesNotMatch(
    actions,
    /\.from\(["'](?:receivable_accounts|receivable_transactions|receivable_installments)["']\)\.(?:insert|update|upsert|delete)/,
  );
  assert.doesNotMatch(actions, /journal_entries|cashbook_entries|hr_payroll_records|record_sale_payment/);
});

test("Phase 3 actions refresh list, dashboard, and exact detail paths only after success", () => {
  assert.match(actions, /revalidatePath\("\/admin\/receivables\/loans\/"\s*\+\s*accountId\)/);
  assert.match(actions, /revalidatePath\("\/admin\/receivables\/loans"\)/);
  assert.match(actions, /revalidatePath\("\/admin\/receivables"\)/);
});
