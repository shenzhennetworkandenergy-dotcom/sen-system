import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveEffectiveDueDate,
  deriveReceivableState,
  normalizeCommercialTermsDraft,
  validateCommercialTermsUpdate,
} from "../lib/sales/commercial-terms.ts";

test("normalizes immediate, preset, custom, partial, and explicit commercial terms", () => {
  assert.deepEqual(normalizeCommercialTermsDraft({ paymentTermsType: "immediate" }), {
    paymentTermsType: "immediate",
    creditPeriodDays: null,
    paymentDueDate: null,
    reason: null,
  });
  for (const days of [7, 15, 30, 45, 60]) {
    assert.equal(normalizeCommercialTermsDraft({
      paymentTermsType: "credit",
      creditPeriodPreset: String(days),
    }).creditPeriodDays, days);
  }
  assert.deepEqual(normalizeCommercialTermsDraft({
    paymentTermsType: "credit",
    creditPeriodPreset: "custom",
    customCreditPeriodDays: "75",
    reason: "  Approved custom term  ",
  }), {
    paymentTermsType: "credit",
    creditPeriodDays: 75,
    paymentDueDate: null,
    reason: "Approved custom term",
  });
  assert.deepEqual(normalizeCommercialTermsDraft({
    paymentTermsType: "partial",
    paymentDueDate: "2026-10-15",
  }), {
    paymentTermsType: "partial",
    creditPeriodDays: null,
    paymentDueDate: "2026-10-15",
    reason: null,
  });
});

test("rejects incomplete or contradictory commercial terms", () => {
  assert.throws(() => normalizeCommercialTermsDraft({ paymentTermsType: "credit" }), /credit period or explicit due date/i);
  assert.throws(() => normalizeCommercialTermsDraft({ paymentTermsType: "partial" }), /credit period or explicit due date/i);
  assert.throws(() => normalizeCommercialTermsDraft({ paymentTermsType: "immediate", creditPeriodPreset: "30" }), /immediate/i);
  assert.throws(() => normalizeCommercialTermsDraft({ paymentTermsType: "credit", creditPeriodPreset: "custom", customCreditPeriodDays: "0" }), /positive whole number/i);
  assert.throws(() => normalizeCommercialTermsDraft({ paymentTermsType: "credit", creditPeriodPreset: "custom", customCreditPeriodDays: "3651" }), /3650/i);
  assert.throws(() => normalizeCommercialTermsDraft({ paymentTermsType: "credit", paymentDueDate: "2026-02-30" }), /invalid/i);
});

test("explicit due date wins and the earliest non-void invoice anchors credit periods in Dhaka", () => {
  assert.deepEqual(deriveEffectiveDueDate({
    explicitDueDate: "2026-10-20",
    creditPeriodDays: 30,
    invoiceTimestamps: ["2026-08-31T20:30:00.000Z"],
  }), {
    dueDate: "2026-10-20",
    invoiceAnchorDate: "2026-09-01",
    source: "explicit",
  });
  assert.deepEqual(deriveEffectiveDueDate({
    explicitDueDate: null,
    creditPeriodDays: 30,
    invoiceTimestamps: [
      "2026-09-14T18:30:00.000Z",
      "2026-08-31T20:30:00.000Z",
      "2026-09-05T12:00:00.000Z",
    ],
  }), {
    dueDate: "2026-10-01",
    invoiceAnchorDate: "2026-09-01",
    source: "credit_period",
  });
  assert.deepEqual(deriveEffectiveDueDate({
    explicitDueDate: null,
    creditPeriodDays: 30,
    invoiceTimestamps: [],
  }), { dueDate: null, invoiceAnchorDate: null, source: "none" });
});

test("invoice finalization freezes type and period while requiring a reasoned explicit correction", () => {
  const current = { paymentTermsType: "credit" as const, creditPeriodDays: 30, paymentDueDate: null };
  assert.throws(() => validateCommercialTermsUpdate({
    current,
    requested: { ...current, paymentDueDate: "2026-10-15", reason: null },
    hasNonVoidInvoice: true,
  }), /reason/i);
  assert.throws(() => validateCommercialTermsUpdate({
    current,
    requested: { paymentTermsType: "credit", creditPeriodDays: 45, paymentDueDate: "2026-10-15", reason: "Correction" },
    hasNonVoidInvoice: true,
  }), /credit period.*cannot be changed/i);
  assert.throws(() => validateCommercialTermsUpdate({
    current,
    requested: { ...current, paymentDueDate: null, reason: "Correction" },
    hasNonVoidInvoice: true,
  }), /explicit due date/i);
  assert.doesNotThrow(() => validateCommercialTermsUpdate({
    current,
    requested: { ...current, paymentDueDate: "2026-10-15", reason: "Customer-approved correction" },
    hasNonVoidInvoice: true,
  }));
});

test("derives paid, current, due soon, overdue, and no-date aging states", () => {
  const today = "2026-08-25";
  assert.deepEqual(deriveReceivableState({ outstandingAmount: 0, dueDate: "2026-01-01", today }), { status: "paid", agingBucket: "paid", daysOverdue: null });
  assert.deepEqual(deriveReceivableState({ outstandingAmount: 100, dueDate: null, today }), { status: "no_due_date", agingBucket: "no_due_date", daysOverdue: null });
  assert.deepEqual(deriveReceivableState({ outstandingAmount: 100, dueDate: "2026-09-10", today }), { status: "current", agingBucket: "not_yet_due", daysOverdue: null });
  assert.deepEqual(deriveReceivableState({ outstandingAmount: 100, dueDate: "2026-09-01", today }), { status: "due_soon", agingBucket: "not_yet_due", daysOverdue: null });
  assert.deepEqual(deriveReceivableState({ outstandingAmount: 100, dueDate: today, today }), { status: "due_soon", agingBucket: "due_today", daysOverdue: 0 });
  assert.deepEqual(deriveReceivableState({ outstandingAmount: 100, dueDate: "2026-08-24", today }), { status: "overdue", agingBucket: "1_30_days_overdue", daysOverdue: 1 });
  assert.equal(deriveReceivableState({ outstandingAmount: 100, dueDate: "2026-07-25", today }).agingBucket, "31_60_days_overdue");
  assert.equal(deriveReceivableState({ outstandingAmount: 100, dueDate: "2026-06-25", today }).agingBucket, "61_90_days_overdue");
  assert.equal(deriveReceivableState({ outstandingAmount: 100, dueDate: "2026-05-25", today }).agingBucket, "90_plus_days_overdue");
});
