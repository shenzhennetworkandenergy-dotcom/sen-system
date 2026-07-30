import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_SELECTION,
  buildProductImagePath,
  sanitizeMediaFileName,
  validateProductImageMetadata,
} from "../lib/inventory/product-media.ts";

const productId = "9f6d83ad-f268-4a04-af99-904f9f33f19f";

test("product images preserve the existing 10 MB quality limit", () => {
  assert.equal(MAX_PRODUCT_IMAGE_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_PRODUCT_IMAGE_SELECTION, 10);
  assert.doesNotThrow(() => validateProductImageMetadata({
    name: "Dell R740 front.webp",
    type: "image/webp",
    size: MAX_PRODUCT_IMAGE_BYTES,
  }));
});

test("product image validation rejects unsupported and oversized files", () => {
  assert.throws(
    () => validateProductImageMetadata({ name: "manual.pdf", type: "application/pdf", size: 100 }),
    /JPG, PNG, or WebP/,
  );
  assert.throws(
    () => validateProductImageMetadata({ name: "large.jpg", type: "image/jpeg", size: MAX_PRODUCT_IMAGE_BYTES + 1 }),
    /10 MB/,
  );
  assert.throws(
    () => validateProductImageMetadata({ name: "empty.png", type: "image/png", size: 0 }),
    /empty/,
  );
});

test("storage paths are product scoped and use the MIME-derived extension", () => {
  assert.equal(
    buildProductImagePath(productId, "image/png", "46ff06c7-47da-4f09-87fe-51d2478d598f"),
    `${productId}/46ff06c7-47da-4f09-87fe-51d2478d598f.png`,
  );
  assert.throws(
    () => buildProductImagePath("../outside", "image/jpeg", "46ff06c7-47da-4f09-87fe-51d2478d598f"),
    /product/,
  );
});

test("original filenames are safe to store as metadata", () => {
  assert.equal(sanitizeMediaFileName("Dell R740 / front (1).jpg"), "Dell_R740___front__1_.jpg");
  assert.equal(sanitizeMediaFileName(""), "image");
  assert.equal(sanitizeMediaFileName("a".repeat(240)).length, 200);
});
