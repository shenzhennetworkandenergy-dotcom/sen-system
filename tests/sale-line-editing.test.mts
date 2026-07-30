import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEditedLine,
  calculateEditedSaleTotal,
  normalizeSaleLineEdit,
  validateFulfilmentFloor,
} from "../lib/sales/line-editing.ts";

test("calculates percentage and fixed line discounts", () => {
  assert.deepEqual(
    calculateEditedLine({
      quantity: 4,
      unitPrice: 8000,
      discountType: "percentage",
      discountValue: 10,
    }),
    { subtotal: 32000, discount: 3200, total: 28800 },
  );
  assert.deepEqual(
    calculateEditedLine({
      quantity: 2,
      unitPrice: 55000,
      discountType: "fixed",
      discountValue: 5000,
    }),
    { subtotal: 110000, discount: 5000, total: 105000 },
  );
});

test("normalizes valid sale line edits and rejects invalid values", () => {
  const id = "6d348c20-547d-45ae-9a61-acde5059d894";
  assert.deepEqual(
    normalizeSaleLineEdit({
      id,
      quantity: "3",
      unit_price: "1250.555",
      discount_type: "percentage",
      discount_value: "5",
    }),
    {
      id,
      quantity: 3,
      unitPrice: 1250.56,
      discountType: "percentage",
      discountValue: 5,
    },
  );
  assert.throws(
    () =>
      normalizeSaleLineEdit({
        id,
        quantity: 0,
        unit_price: 10,
        discount_type: "fixed",
        discount_value: 0,
      }),
    /Quantity/,
  );
  assert.throws(
    () =>
      normalizeSaleLineEdit({
        id,
        quantity: 1,
        unit_price: 10,
        discount_type: "percentage",
        discount_value: 101,
      }),
    /100/,
  );
});

test("protects fulfilled quantities and delivered sales", () => {
  assert.doesNotThrow(() =>
    validateFulfilmentFloor(5, {
      status: "partially_shipped",
      allocated: 2,
      packed: 3,
      shipped: 4,
      delivered: 1,
    }),
  );
  assert.throws(
    () =>
      validateFulfilmentFloor(3, {
        status: "partially_shipped",
        allocated: 2,
        packed: 3,
        shipped: 4,
        delivered: 1,
      }),
    /below 4/,
  );
  assert.throws(
    () =>
      validateFulfilmentFloor(5, {
        status: "delivered",
        allocated: 5,
        packed: 5,
        shipped: 5,
        delivered: 5,
      }),
    /delivered/,
  );
});

test("recalculates the sale total while preserving order-level amounts", () => {
  assert.deepEqual(
    calculateEditedSaleTotal({
      lineTotals: [28800, 105000],
      orderDiscount: 1000,
      shipping: 500,
      service: 2500,
      tax: 1500,
    }),
    { subtotal: 133800, total: 137300 },
  );
});
