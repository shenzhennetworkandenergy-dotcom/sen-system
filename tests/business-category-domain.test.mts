import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastColor,
  normalizeFieldDefinitions,
  normalizeThemeColor,
  validateCategorySpecifications,
} from "../lib/catalog/business-category-domain.ts";

test("normalizes valid theme colors and rejects incomplete or unsafe values", () => {
  assert.equal(normalizeThemeColor(" #0d6efd "), "#0D6EFD");
  assert.throws(() => normalizeThemeColor("#fff"), /six-digit hexadecimal/i);
  assert.throws(() => normalizeThemeColor("red"), /six-digit hexadecimal/i);
  assert.throws(() => normalizeThemeColor("#12345G"), /six-digit hexadecimal/i);
});

test("selects readable white or dark foreground from relative luminance", () => {
  assert.equal(contrastColor("#0D6EFD"), "#ffffff");
  assert.equal(contrastColor("#FD7E14"), "#10152f");
  assert.equal(contrastColor("#FFFFFF"), "#10152f");
  assert.equal(contrastColor("#000000"), "#ffffff");
});

test("normalizes ordered field definitions with stable unique keys", () => {
  assert.deepEqual(
    normalizeFieldDefinitions([
      {
        label: " Rack Size ",
        fieldKey: "",
        fieldType: "select",
        options: "1U, 2U, 4U, 2U",
        unit: "",
        required: true,
        useForVariations: false,
      },
      {
        label: "Throughput",
        fieldKey: "max-throughput",
        fieldType: "number",
        options: "",
        unit: "Gbps",
        required: false,
        useForVariations: false,
      },
    ]),
    [
      {
        field_key: "rack_size",
        label: "Rack Size",
        field_type: "select",
        placeholder: null,
        help_text: null,
        unit: null,
        options: ["1U", "2U", "4U"],
        is_required: true,
        is_filterable: false,
        use_for_variations: false,
        is_active: true,
        sort_order: 0,
      },
      {
        field_key: "max_throughput",
        label: "Throughput",
        field_type: "number",
        placeholder: null,
        help_text: null,
        unit: "Gbps",
        options: [],
        is_required: false,
        is_filterable: false,
        use_for_variations: false,
        is_active: true,
        sort_order: 1,
      },
    ],
  );
});

test("rejects duplicate keys and select fields without options", () => {
  assert.throws(
    () =>
      normalizeFieldDefinitions([
        { label: "Capacity", fieldType: "text" },
        { label: "Capacity", fieldType: "number" },
      ]),
    /unique/i,
  );
  assert.throws(
    () => normalizeFieldDefinitions([{ label: "Size", fieldType: "select" }]),
    /at least one option/i,
  );
});

test("validates required, number, select, boolean, and text specification values", () => {
  const fields = normalizeFieldDefinitions([
    { label: "Capacity", fieldType: "number", required: true, unit: "GB" },
    { label: "Interface", fieldType: "select", options: ["SATA", "NVMe"] },
    { label: "Managed", fieldType: "boolean" },
    { label: "Firmware Version", fieldType: "text" },
  ]);

  assert.deepEqual(
    validateCategorySpecifications(fields, {
      capacity: "64",
      interface: "NVMe",
      managed: "true",
      firmware_version: "  17.4.1  ",
      ignored_key: "not returned",
    }),
    {
      capacity: 64,
      interface: "NVMe",
      managed: true,
      firmware_version: "17.4.1",
    },
  );

  assert.throws(
    () => validateCategorySpecifications(fields, { capacity: "" }),
    /Capacity is required/i,
  );
  assert.throws(
    () => validateCategorySpecifications(fields, { capacity: "many" }),
    /Capacity must be a number/i,
  );
  assert.throws(
    () =>
      validateCategorySpecifications(fields, {
        capacity: 64,
        interface: "SAS",
      }),
    /valid Interface/i,
  );
});

