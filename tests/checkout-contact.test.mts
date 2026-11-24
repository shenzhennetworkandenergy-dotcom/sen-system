import test from "node:test";
import assert from "node:assert/strict";
import { checkoutPhoneOptions, isValidCheckoutPhone } from "../lib/orders/checkout-contact.ts";

test("checkout accepts Bangladesh and international contacts independently of delivery country", () => {
  for (const phone of ["01712345678", "+8801712345678", "+8613800138000", "+86 (138) 0013-8000", "018.1234.5678"])
    assert.equal(isValidCheckoutPhone(phone), true, phone);
});

test("multiple contacts must be selected individually rather than bypass phone validation", () => {
  for (const phone of ["+8613800138000, 01712345678", "01712345678;01812345678", "", "phone", "+86138abc", "13800138000", "0171234567", "+1234567890123456"])
    assert.equal(isValidCheckoutPhone(phone), false, phone);
});

test("saved alternatives are explicit, valid and deduplicated", () => {
  assert.deepEqual(checkoutPhoneOptions(["+86 (138) 0013-8000, 01712345678", "01712-345678;not a number", "\n01812345678"]),
    ["+8613800138000", "01712345678", "01812345678"]);
});
