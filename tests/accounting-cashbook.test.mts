import assert from "node:assert/strict";
import test from "node:test";
import {
  getBusinessDate,
  getBusinessDateTimeLocal,
  normalizeCashbookDate,
  normalizeCashbookDescriptionInput,
  normalizeCashbookEntryInput,
  normalizeOpeningBalance,
  summarizeCashbookEntries,
  toCashbookTimestamp,
} from "../lib/accounting/cashbook.ts";

test("normalizes a reusable income or expense description", () => {
  assert.deepEqual(
    normalizeCashbookDescriptionInput({ name: "  Office rent  ", transactionType: "expense" }),
    { name: "Office rent", transactionType: "expense" },
  );
  assert.throws(
    () => normalizeCashbookDescriptionInput({ name: "x", transactionType: "income" }),
    /at least 2 characters/i,
  );
  assert.throws(
    () => normalizeCashbookDescriptionInput({ name: "Sale", transactionType: "other" }),
    /income or expense/i,
  );
});

test("normalizes positive cashbook amounts and supported payment methods", () => {
  assert.deepEqual(
    normalizeCashbookEntryInput({
      descriptionId: "54a8100e-4e70-42d6-951a-656b7d32a071",
      remark: "  Customer paid in cash  ",
      amount: "1250.456",
      paymentMethod: "bank",
      occurredAt: "2026-07-31T09:30",
    }),
    {
      descriptionId: "54a8100e-4e70-42d6-951a-656b7d32a071",
      remark: "Customer paid in cash",
      amount: 1250.46,
      paymentMethod: "bank",
      occurredAt: "2026-07-31T09:30",
    },
  );
  assert.throws(
    () => normalizeCashbookEntryInput({ descriptionId: "not-a-uuid", amount: "0", paymentMethod: "card", occurredAt: "" }),
    /description/i,
  );
  assert.throws(
    () => normalizeCashbookEntryInput({ descriptionId: "54a8100e-4e70-42d6-951a-656b7d32a071", amount: "-1", paymentMethod: "cash", occurredAt: "" }),
    /greater than zero/i,
  );
});

test("limits cashbook remarks to 240 characters", () => {
  assert.throws(
    () => normalizeCashbookEntryInput({
      descriptionId: "54a8100e-4e70-42d6-951a-656b7d32a071",
      remark: "x".repeat(241),
      amount: "1",
      paymentMethod: "cash",
      occurredAt: "2026-07-31T09:30",
    }),
    /remark/i,
  );
});

test("binds an entry timestamp to the selected statement date", () => {
  assert.equal(toCashbookTimestamp("2026-07-31T09:30", "2026-07-31"), "2026-07-31T09:30:00+06:00");
  assert.throws(() => toCashbookTimestamp("2026-08-01T00:05", "2026-07-31"), /selected cashbook date/i);
});

test("normalizes a non-negative opening cash balance", () => {
  assert.equal(normalizeOpeningBalance("22870.456"), 22870.46);
  assert.equal(normalizeOpeningBalance("0"), 0);
  assert.throws(() => normalizeOpeningBalance("-0.01"), /zero or greater/i);
});

test("derives the business date in Asia Dhaka across a UTC boundary", () => {
  assert.equal(getBusinessDate(new Date("2026-07-30T18:30:00.000Z")), "2026-07-31");
  assert.equal(getBusinessDate(new Date("2026-07-31T17:59:59.000Z")), "2026-07-31");
  assert.equal(getBusinessDateTimeLocal(new Date("2026-07-30T18:30:00.000Z")), "2026-07-31T00:30");
});

test("accepts real report dates and falls back from invalid dates", () => {
  assert.equal(normalizeCashbookDate("2026-02-28", "2026-07-31"), "2026-02-28");
  assert.equal(normalizeCashbookDate("2026-02-30", "2026-07-31"), "2026-07-31");
  assert.equal(normalizeCashbookDate("not-a-date", "2026-07-31"), "2026-07-31");
});

test("summarizes daily income expense and net balance", () => {
  assert.deepEqual(
    summarizeCashbookEntries([
      { transactionType: "income", amount: 4000 },
      { transactionType: "income", amount: 250.25 },
      { transactionType: "expense", amount: 1200.5 },
    ], 22870),
    { opening: 22870, income: 4250.25, expense: 1200.5, net: 3049.75, closing: 25919.75 },
  );
});
