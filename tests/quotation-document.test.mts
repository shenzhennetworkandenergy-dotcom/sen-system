import assert from "node:assert/strict";
import test from "node:test";

import {
  paginateQuotationItems,
  resolveQuotationItemAmounts,
  resolveQuotationTotals,
} from "../lib/quotations/document.ts";

test("paginates quotation items eight per A4 page", () => {
  const items = Array.from({ length: 17 }, (_, index) => ({ id: index + 1 }));
  const pages = paginateQuotationItems(items);

  assert.deepEqual(pages.map((page) => page.length), [8, 8, 1]);
  assert.equal(pages[2][0].id, 17);
});

test("calculates legacy item amounts from target price and quantity", () => {
  assert.deepEqual(
    resolveQuotationItemAmounts({
      quantity: 3,
      target_price: 1250,
      unit_price: null,
      line_total: null,
    }),
    { unitPrice: 1250, lineTotal: 3750 },
  );
});

test("calculates legacy quotation totals from items, discount, and tax", () => {
  const totals = resolveQuotationTotals(
    {
      subtotal: null,
      discount_amount: 500,
      tax_amount: 250,
      total_amount: null,
    },
    [
      { quantity: 2, target_price: 1000, unit_price: null, line_total: null },
      { quantity: 1, target_price: 3000, unit_price: null, line_total: null },
    ],
  );

  assert.deepEqual(totals, {
    subtotal: 5000,
    discount: 500,
    tax: 250,
    total: 4750,
  });
});

test("preserves stored commercial totals", () => {
  assert.deepEqual(
    resolveQuotationTotals(
      {
        subtotal: 10000,
        discount_amount: 750,
        tax_amount: 400,
        total_amount: 9650,
      },
      [],
    ),
    { subtotal: 10000, discount: 750, tax: 400, total: 9650 },
  );
});
