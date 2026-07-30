import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBusinessCategoryForm,
  resolveBusinessCategoryDeletion,
} from "../lib/catalog/business-category-policy.ts";

test("parses a complete category form and its dynamic fields", () => {
  const form = new FormData();
  form.set("name", " Clothing ");
  form.set("slug", "");
  form.set("description", " Apparel and uniforms ");
  form.set("tagline", " Fit for every team ");
  form.set("theme_color", "#6f42c1");
  form.set("icon", "◈");
  form.set("is_active", "on");
  form.set("sort_order", "50");
  form.set(
    "fields_json",
    JSON.stringify([
      {
        label: "Size",
        fieldType: "select",
        options: "XS, S, M, L, XL",
        required: true,
        useForVariations: true,
      },
    ]),
  );

  assert.deepEqual(parseBusinessCategoryForm(form), {
    category: {
      name: "Clothing",
      slug: "clothing",
      description: "Apparel and uniforms",
      tagline: "Fit for every team",
      theme_color: "#6F42C1",
      icon: "◈",
      image_path: null,
      is_active: true,
      sort_order: 50,
    },
    fields: [
      {
        field_key: "size",
        label: "Size",
        field_type: "select",
        placeholder: null,
        help_text: null,
        unit: null,
        options: ["XS", "S", "M", "L", "XL"],
        is_required: true,
        is_filterable: false,
        use_for_variations: true,
        is_active: true,
        sort_order: 0,
      },
    ],
  });
});

test("rejects invalid category colors and malformed fields", () => {
  const invalidColor = new FormData();
  invalidColor.set("name", "Clothing");
  invalidColor.set("theme_color", "purple");
  invalidColor.set("fields_json", "[]");
  assert.throws(
    () => parseBusinessCategoryForm(invalidColor),
    /six-digit hexadecimal/i,
  );

  const invalidFields = new FormData();
  invalidFields.set("name", "Clothing");
  invalidFields.set("theme_color", "#6F42C1");
  invalidFields.set("fields_json", "not json");
  assert.throws(() => parseBusinessCategoryForm(invalidFields), /fields are invalid/i);
});

test("uses archive mode regardless of references", () => {
  assert.deepEqual(
    resolveBusinessCategoryDeletion("archive", {
      productCount: 12,
      productCategoryCount: 3,
    }),
    { operation: "archive" },
  );
});

test("allows permanent deletion only when the category is unused", () => {
  assert.deepEqual(
    resolveBusinessCategoryDeletion("permanent", {
      productCount: 0,
      productCategoryCount: 0,
    }),
    { operation: "permanent" },
  );
  assert.deepEqual(
    resolveBusinessCategoryDeletion("permanent", {
      productCount: 2,
      productCategoryCount: 1,
    }),
    {
      operation: "reject",
      message:
        "This business category is used by 2 products and 1 product category. Reassign them before permanent deletion.",
    },
  );
});

