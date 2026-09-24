import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { buildAdvanceMoneyReceiptData, buildMoneyReceiptData, buildRentReceiptData, mapRentTransactionRowToSnapshot } from "../lib/murshida-manzil/receipts.ts";

const transaction = {
  id: "rent-1",
  receiptNumber: "MM-MR-20260913-00001",
  rentReceiptNumber: "MM-RR-20260913-00001",
  tenantName: "Tenant Name",
  unitCodeSnapshot: "A-1",
  unitDescriptionSnapshot: "Ground floor",
  rentMonth: 9,
  rentYear: 2026,
  monthlyRent: 80000,
  actualMoneyReceived: 70000,
  advanceAdjusted: 10000,
  totalRentSettled: 80000,
  advanceBalanceBefore: 25000,
  advanceBalanceAfter: 15000,
  paymentDate: "2026-09-13",
  paymentMethod: "bank",
  notes: "September rent",
};

test("Money Receipt represents only actual new money received", () => {
  assert.deepEqual(buildMoneyReceiptData(transaction), {
    headingEnglish: "MURSHIDA MANZIL",
    headingBangla: "মুর্শিদা মঞ্জিল",
    receiptNumber: "MM-MR-20260913-00001",
    date: "2026-09-13",
    tenantName: "Tenant Name",
    unitSnapshot: "A-1 · Ground floor",
    rentMonth: 9,
    rentYear: 2026,
    amountReceived: 70000,
    paymentMethod: "bank",
    notes: "September rent",
  });
});

test("Rent Receipt represents full settlement and advance movement", () => {
  assert.deepEqual(buildRentReceiptData(transaction), {
    headingEnglish: "MURSHIDA MANZIL",
    headingBangla: "মুর্শিদা মঞ্জিল",
    receiptNumber: "MM-RR-20260913-00001",
    date: "2026-09-13",
    tenantName: "Tenant Name",
    unitSnapshot: "A-1 · Ground floor",
    rentMonth: 9,
    rentYear: 2026,
    monthlyRent: 80000,
    actualMoneyReceived: 70000,
    advanceAdjusted: 10000,
    totalRentSettled: 80000,
    advanceBalanceBefore: 25000,
    advanceBalanceAfter: 15000,
    paymentMethod: "bank",
  });
});

test("maps a database-shaped rent row to the receipt contract without losing the historical unit snapshot", () => {
  const snapshot = mapRentTransactionRowToSnapshot({
    id: "rent-db-1", money_receipt_number: "MM-MR-DB-1", rent_receipt_number: "MM-RR-DB-1",
    tenant_name: "Tenant DB", unit_code_snapshot: "C-3", unit_description_snapshot: "Original unit",
    rent_month: 9, rent_year: 2026, monthly_rent: "80000", actual_money_received: "70000", advance_adjusted: "10000",
    total_rent_settled: "80000", advance_balance_before: "20000", advance_balance_after: "10000",
    payment_date: "2026-09-13", payment_method: "bank", notes: null,
  });
  assert.equal(snapshot.rentReceiptNumber, "MM-RR-DB-1");
  assert.equal(snapshot.rentMonth, 9);
  assert.equal(snapshot.monthlyRent, 80000);
  assert.equal(snapshot.unitCodeSnapshot, "C-3");
  assert.equal(snapshot.unitDescriptionSnapshot, "Original unit");
});

test("standalone advance receipt stays an advance and uses its unit snapshot", () => {
  const receipt = buildAdvanceMoneyReceiptData({
    id: "adv-1", receiptNumber: "MM-ADV-1", tenantName: "Tenant", unitCodeSnapshot: "B-2",
    unitDescriptionSnapshot: "Second floor", amount: 20000, paymentDate: "2026-09-13",
  });
  assert.equal(receipt.title, "ADVANCE MONEY RECEIPT");
  assert.equal(receipt.amount, 20000);
  assert.equal(receipt.unitSnapshot, "B-2 · Second floor");
  assert.equal("rentMonth" in receipt, false);
});

test("receipt routes are admin-only and print only the receipt document", () => {
  const rentRoute = readFileSync(new URL("../app/admin/murshida-manzil/[id]/rent-receipt/page.tsx", import.meta.url), "utf8");
  const advanceRoute = readFileSync(new URL("../app/admin/murshida-manzil/[id]/advance-receipt/page.tsx", import.meta.url), "utf8");
  const documents = readFileSync(new URL("../app/admin/murshida-manzil/_components/RentReceiptDocument.tsx", import.meta.url), "utf8") + readFileSync(new URL("../app/admin/murshida-manzil/_components/AdvanceMoneyReceiptDocument.tsx", import.meta.url), "utf8") + readFileSync(new URL("../app/admin/murshida-manzil/_components/PrintButton.tsx", import.meta.url), "utf8");
  assert.match(rentRoute, /requireProfile\(\["admin"\]\)/);
  assert.match(advanceRoute, /requireProfile\(\["admin"\]\)/);
  assert.match(documents, /print:hidden/);
  assert.match(documents, /print:min-h/);
  assert.doesNotMatch(documents, /from ["']@\/lib\/(accounting|sales|cashbook)/);
});
