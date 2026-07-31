import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductCategoryIdentity,
  productSaveError,
} from "../lib/inventory/product-editing.ts";

test("builds the persisted category identity and slug from the submitted title", () => {
  assert.deepEqual(
    buildProductCategoryIdentity({
      title: " ABB ACS355-03E-31A0-4 Industrial VFD Drive - 15kW / 20HP ",
      businessCategoryId: "9ec2f76b-e9f9-4735-80bd-12e7c9772e89",
      businessCategoryName: "Energy",
    }),
    {
      slug: "abb-acs355-03e-31a0-4-industrial-vfd-drive-15kw-20hp",
      business_category_id: "9ec2f76b-e9f9-4735-80bd-12e7c9772e89",
      sen_business_category: "Energy",
    },
  );
});

test("explains a classification and business-category mismatch precisely", () => {
  assert.equal(
    productSaveError("Product classification must use the selected business category"),
    "The selected product classification belongs to a different business category. Choose a classification listed under the selected business category, then save again.",
  );
});

test("explains duplicate slugs and missing production migrations", () => {
  assert.equal(
    productSaveError(
      'duplicate key value violates unique constraint "products_slug_key"',
    ),
    "Another product already uses this title-generated URL. Change the product title so its URL is unique.",
  );
  assert.equal(
    productSaveError(
      'column "business_category_id" of relation "products" does not exist',
    ),
    "The product database is not up to date. Apply the latest Supabase migrations, then try again.",
  );
});

test("keeps an unexpected database reason actionable without exposing multiline output", () => {
  assert.equal(
    productSaveError("Unexpected constraint failure\nDETAIL: invalid row"),
    "Unable to save product. Technical reason: Unexpected constraint failure DETAIL: invalid row",
  );
});
