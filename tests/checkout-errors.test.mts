import test from "node:test";
import assert from "node:assert/strict";
import {
  checkoutErrorMessage,
  isExpectedCheckoutRejection,
} from "../lib/orders/checkout-errors.ts";

test("stock and customer-input rejections are expected business outcomes", () => {
  assert.equal(
    isExpectedCheckoutRejection({
      code: "P0001",
      message: "No fulfilment warehouse has sufficient stock for this cart",
    }),
    true,
  );
  assert.equal(
    isExpectedCheckoutRejection({
      code: "P0001",
      message: "The selected address does not belong to this customer",
    }),
    true,
  );
});

test("unexpected database failures remain operational errors", () => {
  assert.equal(
    isExpectedCheckoutRejection({
      code: "XX000",
      message: "connection terminated unexpectedly",
    }),
    false,
  );
  assert.equal(
    checkoutErrorMessage({
      code: "XX000",
      message: "connection terminated unexpectedly",
    }),
    "Unable to place order. Please verify your information and try again.",
  );
});
