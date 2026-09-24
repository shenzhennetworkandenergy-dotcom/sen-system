import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPayrollStatusTransition,
  buildPayrollPlanHash,
  derivePayrollOperationId,
  planPayrollLoanDeductions,
  type PayrollLoanAccount,
} from "../lib/hr/payroll-receivables.ts";

const employeeId = "4f7a4b2a-25d5-4782-a9c0-46c6fcf21c6a";
const accountA = "109b7f72-8e53-4ae8-a4cb-1e6839e6cc17";
const accountB = "bf84d07e-1f8e-4ad0-9ba4-6e3c778c87be";

function account(overrides: Partial<PayrollLoanAccount> = {}): PayrollLoanAccount {
  return {
    id: accountA,
    employeeRecordId: employeeId,
    category: "employee_loan",
    status: "active",
    currency: "BDT",
    outstandingAmount: 10000,
    repaymentMethod: "salary_deduction",
    installment: {
      installmentNumber: 1,
      dueDate: "2026-08-31",
      amountDue: 5000,
      remainingAmount: 5000,
    },
    ...overrides,
  };
}

test("plans one due installment per eligible employee loan and caps the final installment", () => {
  const result = planPayrollLoanDeductions({
    employeeRecordId: employeeId,
    periodEnd: "2026-08-31",
    currency: "BDT",
    currentGrossPay: 40000,
    existingDeductions: 2000,
    accounts: [
      account({ outstandingAmount: 3000, installment: { installmentNumber: 1, dueDate: "2026-08-31", amountDue: 5000, remainingAmount: 5000 } }),
      account({ id: accountB, category: "salary_advance", outstandingAmount: 8000, installment: { installmentNumber: 2, dueDate: "2026-08-31", amountDue: 3000, remainingAmount: 3000 } }),
    ],
  });

  assert.deepEqual(result.deductions.map((row) => [row.receivableAccountId, row.amount]), [
    [accountA, 3000],
    [accountB, 3000],
  ]);
  assert.equal(result.totalDeduction, 8000);
  assert.equal(result.netPayable, 32000);
});

test("excludes accounts outside the approved salary-deduction eligibility boundary", () => {
  const result = planPayrollLoanDeductions({
    employeeRecordId: employeeId,
    periodEnd: "2026-08-31",
    currency: "BDT",
    currentGrossPay: 40000,
    existingDeductions: 0,
    accounts: [
      account(),
      account({ id: accountB, repaymentMethod: "cash" }),
      account({ id: "1a0b2512-b3ba-4670-bf63-4e2cb7c4cc1a", status: "approved" }),
      account({ id: "b9935235-636c-4a4f-b1d7-d9d7ce5aa78c", installment: null }),
      account({ id: "6840e3e9-155e-4f4c-a9db-5901cf2c4d5a", employeeRecordId: "2f6c6437-5549-49de-9517-2a9d1540d8ab" }),
      account({ id: "4cefc8ad-45a3-4403-8cfb-a572cdfe2a91", installment: { installmentNumber: 1, dueDate: "2026-09-01", amountDue: 5000, remainingAmount: 5000 } }),
      account({ id: "f1767623-c7a2-45a7-91ee-9e86a55e4e61", category: "customer_loan" }),
    ],
  });

  assert.deepEqual(result.deductions.map((row) => row.receivableAccountId), [accountA]);
});

test("rejects a plan that would make net payable negative", () => {
  assert.throws(() => planPayrollLoanDeductions({
    employeeRecordId: employeeId,
    periodEnd: "2026-08-31",
    currency: "BDT",
    currentGrossPay: 5000,
    existingDeductions: 4500,
    accounts: [account({ outstandingAmount: 2000, installment: { installmentNumber: 1, dueDate: "2026-08-31", amountDue: 2000, remainingAmount: 2000 } })],
  }), /net payable/i);
});

test("operation IDs and plan hashes are deterministic and order independent", () => {
  assert.equal(
    derivePayrollOperationId("3d430f98-1b6c-4d25-a18c-7f8cfaa1d4d0", accountA),
    derivePayrollOperationId("3d430f98-1b6c-4d25-a18c-7f8cfaa1d4d0", accountA),
  );
  assert.notEqual(
    derivePayrollOperationId("3d430f98-1b6c-4d25-a18c-7f8cfaa1d4d0", accountA),
    derivePayrollOperationId("3d430f98-1b6c-4d25-a18c-7f8cfaa1d4d0", accountB),
  );
  const rows = [{ receivableAccountId: accountA, amount: 3000 }, { receivableAccountId: accountB, amount: 1000 }];
  assert.equal(buildPayrollPlanHash("payroll-1", rows), buildPayrollPlanHash("payroll-1", [...rows].reverse()));
});

test("only valid payroll transitions are accepted and Paid is final", () => {
  assert.doesNotThrow(() => assertPayrollStatusTransition("draft", "approved"));
  assert.doesNotThrow(() => assertPayrollStatusTransition("approved", "paid"));
  assert.doesNotThrow(() => assertPayrollStatusTransition("draft", "cancelled"));
  assert.throws(() => assertPayrollStatusTransition("draft", "paid"), /approved.*paid/i);
  assert.throws(() => assertPayrollStatusTransition("paid", "approved"), /final|cannot/i);
  assert.throws(() => assertPayrollStatusTransition("paid", "cancelled"), /final|cannot/i);
});
