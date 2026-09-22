import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveReceivableStatus,
  formatReceivableNumber,
  normalizeOpeningReceivableInput,
  normalizeRequestedReceivableInput,
} from "../lib/receivables/domain.ts";

const operationId = "87ba2184-e269-47cc-8fce-fe287ad37e3d";
const employeeId = "8b0c35ef-5e91-4479-a5de-32962d91c2ab";

test("normalizes a requested employee loan without creating a balance movement", () => {
  const result = normalizeRequestedReceivableInput({
    operationId: ` ${operationId} `,
    category: "employee_loan",
    borrowerType: "employee",
    borrowerId: employeeId,
    originalAmount: "50000.12555",
    currency: " bdt ",
    defaultRepaymentMethod: "salary_deduction",
    installmentCount: "5",
    installmentAmount: "10000.025",
    firstDueDate: "2026-09-01",
    finalDueDate: "2027-01-01",
    notes: "  Existing employee request  ",
  });

  assert.equal(result.operationId, operationId);
  assert.equal(result.originalAmount, 50000.1256);
  assert.equal(result.currency, "BDT");
  assert.equal(result.status, "requested");
  assert.equal(result.isOpeningBalance, false);
  assert.equal(result.notes, "Existing employee request");
});

test("accepts an exact opening balance equation and external party", () => {
  const result = normalizeOpeningReceivableInput({
    operationId,
    category: "security_deposit",
    borrowerType: "external_party",
    externalPartyType: "company",
    externalPartyDisplayName: "  Gulshan Property Owner  ",
    externalPartyCompanyName: " Property Holdings Ltd ",
    originalAmount: "600000",
    previouslyRepaidAmount: "120000",
    openingOutstandingAmount: "480000",
    asOfDate: "2026-08-25",
    currency: "BDT",
    defaultRepaymentMethod: "bank",
    installmentCount: "10",
    installmentAmount: "50000",
  });

  assert.equal(result.externalParty?.displayName, "Gulshan Property Owner");
  assert.equal(result.externalParty?.companyName, "Property Holdings Ltd");
  assert.equal(result.openingOutstandingAmount, 480000);
  assert.equal(result.status, "active");
  assert.equal(result.isOpeningBalance, true);
});

test("rejects an opening balance that does not reconcile", () => {
  assert.throws(
    () =>
      normalizeOpeningReceivableInput({
        operationId,
        category: "employee_loan",
        borrowerType: "employee",
        borrowerId: employeeId,
        originalAmount: 200000,
        previouslyRepaidAmount: 120000,
        openingOutstandingAmount: 70000,
        asOfDate: "2026-08-25",
      }),
    /must equal original amount minus previously repaid/i,
  );
});

test("requires exactly one valid borrower source", () => {
  assert.throws(
    () =>
      normalizeRequestedReceivableInput({
        operationId,
        category: "employee_loan",
        borrowerType: "employee",
        originalAmount: 50000,
      }),
    /borrower is required/i,
  );

  assert.throws(
    () =>
      normalizeRequestedReceivableInput({
        operationId,
        category: "other",
        borrowerType: "external_party",
        borrowerId: employeeId,
        externalPartyDisplayName: "Duplicate source",
        originalAmount: 50000,
      }),
    /choose an existing external party or enter a new one/i,
  );
});

test("enforces Phase 3 category and borrower compatibility", () => {
  const base = {
    operationId,
    borrowerId: employeeId,
    originalAmount: 50_000,
  };

  assert.doesNotThrow(() =>
    normalizeRequestedReceivableInput({
      ...base,
      category: "salary_advance",
      borrowerType: "employee",
    }),
  );
  assert.doesNotThrow(() =>
    normalizeRequestedReceivableInput({
      ...base,
      category: "rent_advance",
      borrowerType: "employee",
    }),
  );
  assert.throws(
    () =>
      normalizeRequestedReceivableInput({
        ...base,
        category: "employee_loan",
        borrowerType: "supplier",
      }),
    /employee loan.*employee borrower/i,
  );
  assert.throws(
    () =>
      normalizeRequestedReceivableInput({
        ...base,
        category: "supplier_refundable_advance",
        borrowerType: "customer",
      }),
    /supplier refundable advance.*supplier borrower/i,
  );
});

test("rejects invalid operation IDs, money, dates, and currencies", () => {
  const valid = {
    category: "employee_loan" as const,
    borrowerType: "employee" as const,
    borrowerId: employeeId,
    originalAmount: 50000,
  };

  assert.throws(
    () => normalizeRequestedReceivableInput({ ...valid, operationId: "retry" }),
    /operation id/i,
  );
  assert.throws(
    () => normalizeRequestedReceivableInput({ ...valid, operationId, originalAmount: 0 }),
    /greater than zero/i,
  );
  assert.throws(
    () => normalizeRequestedReceivableInput({ ...valid, operationId, currency: "TAKA" }),
    /currency/i,
  );
  assert.throws(
    () =>
      normalizeRequestedReceivableInput({
        ...valid,
        operationId,
        firstDueDate: "2026-10-01",
        finalDueDate: "2026-09-01",
      }),
    /final due date/i,
  );
});

test("derives compact operational statuses and formats references", () => {
  assert.equal(deriveReceivableStatus(500000, 0), "current");
  assert.equal(deriveReceivableStatus(500000, 200000), "partially_paid");
  assert.equal(deriveReceivableStatus(500000, 500000), "paid");
  assert.equal(deriveReceivableStatus(500000, 550000), "paid");
  assert.equal(formatReceivableNumber(" rec-2026-000123 "), "REC-2026-000123");
});
