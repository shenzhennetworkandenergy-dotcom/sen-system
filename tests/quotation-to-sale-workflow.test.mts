import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionQuotation,
  isQuotationExpired,
  isQuotationImmutable,
  isQuotationSaleEligible,
  quotationStatusMeta,
} from "../lib/quotations/workflow.ts";

test("quotation transitions preserve staff approval and customer acceptance as separate states", () => {
  assert.equal(canTransitionQuotation("draft", "approve"), true);
  assert.equal(canTransitionQuotation("approved", "issue"), true);
  assert.equal(canTransitionQuotation("quoted", "accept"), true);
  assert.equal(canTransitionQuotation("quoted", "decline"), true);
  assert.equal(canTransitionQuotation("accepted", "convert"), true);

  assert.equal(canTransitionQuotation("approved", "convert"), false);
  assert.equal(canTransitionQuotation("rejected", "convert"), false);
  assert.equal(canTransitionQuotation("declined", "convert"), false);
  assert.equal(canTransitionQuotation("converted_to_sale", "convert"), false);
});

test("accepted unconverted quotations stay sale eligible after their validity date", () => {
  assert.equal(isQuotationExpired("2026-08-22", "2026-08-23"), true);
  assert.equal(isQuotationExpired("2026-08-23", "2026-08-23"), false);
  const expiredAcceptance = { status: "accepted", expirationDate: "2026-08-22", convertedOrderId: null };
  assert.equal(isQuotationSaleEligible(expiredAcceptance), true);
  assert.equal(isQuotationSaleEligible({ ...expiredAcceptance, status: "expired" }), false);
  assert.equal(isQuotationSaleEligible({ ...expiredAcceptance, convertedOrderId: "sale-1" }), false);
  assert.equal(canTransitionQuotation("quoted", "accept", "2026-08-22", "2026-08-23"), false);
  assert.equal(isQuotationImmutable("accepted"), true);
});

test("quotation status metadata presents active and legacy business states consistently", () => {
  assert.deepEqual(quotationStatusMeta.draft, { label: "Draft", color: "gray" });
  assert.deepEqual(quotationStatusMeta.quoted, { label: "Issued", color: "blue" });
  assert.deepEqual(quotationStatusMeta.accepted, { label: "Accepted", color: "green" });
  assert.deepEqual(quotationStatusMeta.declined, {
    label: "Rejected by Customer",
    color: "red",
  });
  assert.deepEqual(quotationStatusMeta.expired, { label: "Expired", color: "amber" });
  assert.deepEqual(quotationStatusMeta.converted_to_sale, {
    label: "Converted to Sale",
    color: "green",
  });
  assert.deepEqual(quotationStatusMeta.converted_to_invoice, {
    label: "Converted to Invoice",
    color: "green",
  });
});
