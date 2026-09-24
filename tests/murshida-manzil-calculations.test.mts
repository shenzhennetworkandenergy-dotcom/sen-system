import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateByOwnership,
  calculateRentSettlement,
  validateOwnershipPercentages,
} from "../lib/murshida-manzil/calculations.ts";

test("accepts configurable active owner percentages only when they total exactly 100%", () => {
  assert.equal(validateOwnershipPercentages([
    { id: "a", percentage: 40 },
    { id: "b", percentage: 20 },
    { id: "c", percentage: 20 },
    { id: "d", percentage: 20 },
  ]), true);

  assert.throws(() => validateOwnershipPercentages([
    { id: "a", percentage: 25 },
    { id: "b", percentage: 25 },
    { id: "c", percentage: 25 },
  ]), /100/);
});

test("allocates income or expense using the captured ownership percentages", () => {
  assert.deepEqual(allocateByOwnership(80000, [
    { ownerId: "a", percentage: 40 },
    { ownerId: "b", percentage: 20 },
    { ownerId: "c", percentage: 20 },
    { ownerId: "d", percentage: 20 },
  ]), [
    { ownerId: "a", percentage: 40, amount: 32000 },
    { ownerId: "b", percentage: 20, amount: 16000 },
    { ownerId: "c", percentage: 20, amount: 16000 },
    { ownerId: "d", percentage: 20, amount: 16000 },
  ]);
});

test("uses full rent settled for owner income while keeping cash and advance separate", () => {
  assert.deepEqual(calculateRentSettlement({
    monthlyRent: 80000,
    actualMoneyReceived: 70000,
    advanceAdjusted: 10000,
    advanceBalanceBefore: 25000,
  }), {
    totalRentSettled: 80000,
    advanceBalanceAfter: 15000,
    ownerIncomeBase: 80000,
    moneyReceiptAmount: 70000,
  });
});

test("rejects advance adjustment beyond the remaining tenant advance", () => {
  assert.throws(() => calculateRentSettlement({
    monthlyRent: 80000,
    actualMoneyReceived: 70000,
    advanceAdjusted: 10000,
    advanceBalanceBefore: 5000,
  }), /advance/i);
});
