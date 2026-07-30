import assert from "node:assert/strict";
import test from "node:test";

import { calculateDocumentDiscounts } from "../lib/documents/commercial-totals.ts";

test("combines invoice line discounts with the order discount", () => {
  assert.deepEqual(
    calculateDocumentDiscounts(
      [
        { line_discount: 3000 },
        { line_discount: 0 },
        { line_discount: "250.555" },
      ],
      500,
    ),
    {
      lineDiscount: 3250.56,
      orderDiscount: 500,
      totalDiscount: 3750.56,
    },
  );
});

test("uses quotation item discounts and treats missing values as zero", () => {
  assert.deepEqual(
    calculateDocumentDiscounts(
      [
        { discount_amount: 1200 },
        { discount_amount: null },
        {},
      ],
      "300",
    ),
    {
      lineDiscount: 1200,
      orderDiscount: 300,
      totalDiscount: 1500,
    },
  );
});

test("does not allow negative document discounts", () => {
  assert.deepEqual(
    calculateDocumentDiscounts([{ line_discount: -50 }], -100),
    {
      lineDiscount: 0,
      orderDiscount: 0,
      totalDiscount: 0,
    },
  );
});
