import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultQuotationExpirationDate,
  resolveQuotationExpirationDate,
} from "../lib/quotations/validity.ts";

test("defaults quotation validity to five calendar days", () => {
  assert.equal(defaultQuotationExpirationDate("2026-07-30"), "2026-08-04");
});

test("rolls the five-day validity across calendar years", () => {
  assert.equal(defaultQuotationExpirationDate("2026-12-29"), "2027-01-03");
});

test("preserves an administrator-selected expiration date", () => {
  assert.equal(
    resolveQuotationExpirationDate(
      "2026-08-15",
      "2026-07-30T04:00:00.000Z",
    ),
    "2026-08-15",
  );
});

test("gives legacy quotations a five-day validity date", () => {
  assert.equal(
    resolveQuotationExpirationDate(null, "2026-07-30T04:00:00.000Z"),
    "2026-08-04",
  );
});
