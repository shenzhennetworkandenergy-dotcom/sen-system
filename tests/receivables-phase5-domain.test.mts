import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNTING_ADJUSTMENT_TREATMENTS,
  normalizeAccountingAdjustmentInput,
  normalizeAccountingReversalInput,
} from "../lib/receivables/non-sales.ts";

const id = "11111111-1111-4111-8111-111111111111";
const transactionId = "22222222-2222-4222-8222-222222222222";

test("Phase 5 exposes the approved typed adjustment treatments", () => {
  assert.deepEqual(ACCOUNTING_ADJUSTMENT_TREATMENTS, [
    "cash_recovery",
    "rent_expense_offset",
    "payable_offset",
    "write_off",
    "non_cash_correction",
  ]);
});

test("cash recovery requires a real cash, bank, or MFS channel", () => {
  const normalized = normalizeAccountingAdjustmentInput({
    accountId: id,
    operationId: transactionId,
    direction: "decrease",
    amount: "2500",
    effectiveDate: "2026-08-26",
    paymentMethod: "bank",
    accountingTreatment: "cash_recovery",
    reason: "Refund received",
    hasApprovedSchedule: false,
  });
  assert.equal(normalized.paymentMethod, "bank");
  assert.equal(normalized.accountingTreatment, "cash_recovery");
  assert.throws(
    () => normalizeAccountingAdjustmentInput({
      ...normalized,
      paymentMethod: "other",
      hasApprovedSchedule: false,
    }),
    /cash, bank, or MFS/i,
  );
});

test("non-cash treatments cannot masquerade as cash movement", () => {
  assert.throws(
    () => normalizeAccountingAdjustmentInput({
      accountId: id,
      operationId: transactionId,
      direction: "decrease",
      amount: 100,
      effectiveDate: "2026-08-26",
      paymentMethod: "cash",
      accountingTreatment: "rent_expense_offset",
      reason: "Monthly rent offset",
      hasApprovedSchedule: false,
    }),
    /Other.*non-cash/i,
  );
});

test("posting reversal requires a posting id and reason", () => {
  const normalized = normalizeAccountingReversalInput({
    accountId: id,
    postingId: transactionId,
    operationId: "33333333-3333-4333-8333-333333333333",
    effectiveDate: "2026-08-26",
    reason: "Bank payment was entered against the wrong loan",
  });
  assert.equal(normalized.postingId, transactionId);
  assert.throws(
    () => normalizeAccountingReversalInput({ ...normalized, reason: "" }),
    /Reason is required/i,
  );
});
