import assert from "node:assert/strict";
import test from "node:test";

import {
  currencyOptions,
  filterCurrencyOptions,
  normalizeCurrencyCode,
} from "../lib/currency/currencies.ts";

test("currency suggestions include international code and name matches", () => {
  assert.ok(currencyOptions.some((item) => item.code === "BDT" && /taka/i.test(item.name)));
  assert.ok(currencyOptions.some((item) => item.code === "USD" && /dollar/i.test(item.name)));
  assert.equal(filterCurrencyOptions("taka")[0]?.code, "BDT");
  assert.equal(filterCurrencyOptions("usd")[0]?.code, "USD");
});

test("typed currency codes are normalized but not restricted to suggestions", () => {
  assert.equal(normalizeCurrencyCode(" bdt "), "BDT");
  assert.equal(normalizeCurrencyCode("xbt"), "XBT");
  assert.throws(() => normalizeCurrencyCode("US"), /three-letter/i);
  assert.throws(() => normalizeCurrencyCode("12A"), /three-letter/i);
});

