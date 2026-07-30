import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFieldDefinitions } from "../lib/catalog/business-category-domain.ts";
import {
  categoryVariationSuggestions,
  mergeCategorySpecifications,
  parseStoredSpecifications,
  selectActiveBusinessCategory,
} from "../lib/inventory/category-specifications.ts";

const fields = normalizeFieldDefinitions([
  { label: "Capacity", fieldType: "number", required: true, useForVariations: true },
  { label: "Battery Type", fieldType: "select", options: ["LiFePO4", "AGM"] },
  { label: "Outdoor", fieldType: "boolean" },
]);

test("selects only an active submitted business category", () => {
  const categories = [
    { id: "active", active: true, name: "Energy" },
    { id: "inactive", active: false, name: "Legacy" },
  ];
  assert.equal(selectActiveBusinessCategory(categories, "active")?.name, "Energy");
  assert.equal(selectActiveBusinessCategory(categories, "inactive"), null);
  assert.equal(selectActiveBusinessCategory(categories, "unknown"), null);
});

test("parses object or JSON specification values without accepting arrays", () => {
  assert.deepEqual(parseStoredSpecifications('{"legacy":"kept"}'), {
    legacy: "kept",
  });
  assert.deepEqual(parseStoredSpecifications({ legacy: "kept" }), {
    legacy: "kept",
  });
  assert.throws(() => parseStoredSpecifications("[]"), /JSON object/i);
  assert.throws(() => parseStoredSpecifications("{"), /valid JSON/i);
});

test("validates category values and preserves only unrelated legacy keys", () => {
  assert.deepEqual(
    mergeCategorySpecifications(
      fields,
      { capacity: "200", battery_type: "LiFePO4", outdoor: "false" },
      { capacity: 100, old_internal_code: "A-17" },
    ),
    {
      old_internal_code: "A-17",
      capacity: 200,
      battery_type: "LiFePO4",
      outdoor: false,
    },
  );
  assert.throws(
    () =>
      mergeCategorySpecifications(
        fields,
        { capacity: "200", battery_type: "Lithium" },
        {},
      ),
    /valid Battery Type/i,
  );
});

test("builds variation suggestions from marked populated category fields", () => {
  assert.deepEqual(
    categoryVariationSuggestions(fields, { capacity: 200 }),
    [
      {
        name: "Capacity",
        values: "200",
        universal: false,
        variation: true,
      },
    ],
  );
  assert.deepEqual(categoryVariationSuggestions(fields, {}), []);
});

