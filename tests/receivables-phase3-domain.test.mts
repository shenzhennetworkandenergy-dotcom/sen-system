import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstallmentSchedule,
  deriveInstallmentStates,
  deriveOperationalOutstanding,
  normalizeAdjustmentInput,
  normalizeDisbursementInput,
  normalizeLifecycleInput,
  normalizeRepaymentInput,
  normalizeReversalInput,
} from "../lib/receivables/non-sales.ts";

const accountId = "8b0c35ef-5e91-4479-a5de-32962d91c2ab";
const transactionId = "68e2ed99-c423-4044-93d5-acf85e87cda2";
const operationId = "87ba2184-e269-47cc-8fce-fe287ad37e3d";

test("normalizes lifecycle transitions and requires approval amount or terminal reason", () => {
  assert.deepEqual(
    normalizeLifecycleInput({
      accountId,
      operationId,
      action: "approve",
      approvedAmount: "75000.12345",
      reason: "  Approved within policy  ",
    }),
    {
      accountId,
      operationId,
      action: "approve",
      approvedAmount: 75000.1235,
      reason: "Approved within policy",
    },
  );
  assert.throws(
    () => normalizeLifecycleInput({ accountId, operationId, action: "approve" }),
    /approved amount/i,
  );
  assert.throws(
    () => normalizeLifecycleInput({ accountId, operationId, action: "reject" }),
    /reason/i,
  );
});

test("manual disbursement and repayment accept operational methods but reject salary deduction", () => {
  assert.equal(
    normalizeDisbursementInput({
      accountId,
      operationId,
      amount: "50000",
      effectiveDate: "2026-08-25",
      paymentMethod: "bank",
      note: "  Bank transfer reference SEN-1  ",
    }).paymentMethod,
    "bank",
  );
  assert.equal(
    normalizeRepaymentInput({
      accountId,
      operationId,
      amount: "10000",
      effectiveDate: "2026-09-25",
      paymentMethod: "mfs",
    }).amount,
    10000,
  );
  assert.throws(
    () =>
      normalizeRepaymentInput({
        accountId,
        operationId,
        amount: "10000",
        effectiveDate: "2026-09-25",
        paymentMethod: "salary_deduction",
      }),
    /salary deduction.*phase 4/i,
  );
  assert.throws(
    () =>
      normalizeRepaymentInput({
        accountId,
        operationId,
        amount: "0",
        effectiveDate: "2026-09-25",
        paymentMethod: "cash",
      }),
    /greater than zero/i,
  );
});

test("adjustments and reversals require a reason and protect approved schedules", () => {
  assert.throws(
    () =>
      normalizeAdjustmentInput({
        accountId,
        operationId,
        direction: "increase",
        amount: 5000,
        effectiveDate: "2026-09-01",
        reason: "Correction",
        hasApprovedSchedule: true,
      }),
    /approved installment schedule/i,
  );
  assert.equal(
    normalizeAdjustmentInput({
      accountId,
      operationId,
      direction: "decrease",
      amount: 50000,
      effectiveDate: "2026-09-01",
      reason: "  Monthly rent adjustment  ",
      hasApprovedSchedule: true,
    }).reason,
    "Monthly rent adjustment",
  );
  assert.throws(
    () =>
      normalizeReversalInput({
        accountId,
        transactionId,
        operationId,
        effectiveDate: "2026-09-02",
      }),
    /reason/i,
  );
});

test("builds a monthly schedule with a clamped date and last-installment remainder", () => {
  assert.deepEqual(
    buildInstallmentSchedule({
      approvedAmount: 1000,
      installmentCount: 3,
      installmentAmount: 333.33,
      firstDueDate: "2026-08-31",
    }),
    [
      { installmentNumber: 1, dueDate: "2026-08-31", amountDue: 333.33 },
      { installmentNumber: 2, dueDate: "2026-09-30", amountDue: 333.33 },
      { installmentNumber: 3, dueDate: "2026-10-31", amountDue: 333.34 },
    ],
  );
  assert.throws(
    () =>
      buildInstallmentSchedule({
        approvedAmount: 1000,
        installmentCount: 3,
        installmentAmount: 600,
        firstDueDate: "2026-08-31",
      }),
    /exceed.*approved amount/i,
  );
});

test("derives FIFO paid, partial, unpaid and overdue installment states", () => {
  const result = deriveInstallmentStates(
    [
      { installmentNumber: 1, dueDate: "2026-08-01", amountDue: 500 },
      { installmentNumber: 2, dueDate: "2026-09-01", amountDue: 500 },
      { installmentNumber: 3, dueDate: "2026-10-01", amountDue: 500 },
    ],
    750,
    "2026-09-10",
  );

  assert.deepEqual(
    result.map(({ paidAmount, remainingAmount, status }) => ({
      paidAmount,
      remainingAmount,
      status,
    })),
    [
      { paidAmount: 500, remainingAmount: 0, status: "paid" },
      { paidAmount: 250, remainingAmount: 250, status: "overdue" },
      { paidAmount: 0, remainingAmount: 500, status: "unpaid" },
    ],
  );
});

test("derives outstanding from immutable signed movements without an editable balance", () => {
  assert.equal(
    deriveOperationalOutstanding([
      { direction: "increase", amount: 600000 },
      { direction: "decrease", amount: 50000 },
      { direction: "decrease", amount: 50000 },
      { direction: "increase", amount: 10000 },
    ]),
    510000,
  );
});
