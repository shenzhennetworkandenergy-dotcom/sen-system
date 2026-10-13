import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

test("variation selection has an image-switching contract", () => {
  const gallery = read("components/catalog/ProductImageGallery.tsx");
  const purchasePanel = read("components/catalog/ProductPurchasePanel.tsx");
  const productPage = read("app/products/[slug]/page.tsx");
  const products = read("lib/catalog/products.ts");

  assert.match(gallery, /variationImages/);
  assert.match(gallery, /product-variation-change/);
  assert.match(purchasePanel, /product-variation-change/);
  assert.match(productPage, /variationImages/);
  assert.match(products, /variation_id/);
});
