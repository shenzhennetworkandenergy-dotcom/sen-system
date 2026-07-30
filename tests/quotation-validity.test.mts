import assert from "node:assert/strict";
import test from "node:test";

import { defaultQuotationExpiration } from "../lib/quotations/validity.ts";

test("defaults a quotation to five calendar days after its issue date", () => {
  const issueDate = new Date("2026-07-30T00:00:00.000Z");

  assert.equal(defaultQuotationExpiration(issueDate), "2026-08-04");
});

test("keeps the five-day validity correct across year boundaries", () => {
  const issueDate = new Date("2026-12-29T00:00:00.000Z");

  assert.equal(defaultQuotationExpiration(issueDate), "2027-01-03");
});

test("uses the Bangladesh business date around UTC day boundaries", () => {
  const oneAmInBangladesh = new Date("2026-07-29T19:00:00.000Z");

  assert.equal(defaultQuotationExpiration(oneAmInBangladesh), "2026-08-04");
});
