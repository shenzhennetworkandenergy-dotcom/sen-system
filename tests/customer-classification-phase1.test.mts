import assert from "node:assert/strict";
import test from "node:test";

import {
  BANGLADESH_DISTRICTS,
  CUSTOMER_BUSINESS_CATEGORIES,
  classificationLabel,
  validateCustomerClassification,
} from "../lib/customers/classification.ts";

test("ships the controlled 64-district Bangladesh list", () => {
  assert.equal(BANGLADESH_DISTRICTS.length, 64);
  assert.equal(BANGLADESH_DISTRICTS.find((item) => item.code === "DHA" )?.name, "Dhaka");
  assert.equal(BANGLADESH_DISTRICTS.find((item) => item.code === "RNG" )?.name, "Rangpur");
});

test("customer category seed contains the approved customer segments", () => {
  assert.deepEqual(
    CUSTOMER_BUSINESS_CATEGORIES.map((item) => item.name),
    [
      "Networking",
      "Energy",
      "Medical Equipment",
      "Commercial Equipment",
      "Garments",
      "Industrial Automation",
      "Industrial Components",
      "Semiconductor",
    ],
  );
});

test("zero categories is unclassified and district can be absent", () => {
  assert.equal(classificationLabel([], null), "Unclassified · Not Set");
  assert.deepEqual(validateCustomerClassification([], null), {
    ok: false,
    message: "Choose at least one business category and a district.",
  });
});

test("valid multi-category customer classification passes", () => {
  assert.deepEqual(
    validateCustomerClassification(["networking", "semiconductor"], "DHA"),
    { ok: true },
  );
});

test("unknown category or district is rejected", () => {
  assert.equal(validateCustomerClassification(["unknown"], "DHA").ok, false);
  assert.equal(validateCustomerClassification(["networking"], "XXX").ok, false);
});
