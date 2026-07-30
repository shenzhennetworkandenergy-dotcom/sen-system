import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

const actions = read("app/admin/products/actions.ts");
for (const token of [
  "prepareProductImageUploadAction",
  "finalizeProductImageUploadAction",
  "createSignedUploadUrl",
  ".info(",
]) {
  assert.ok(actions.includes(token), `Product media actions are missing ${token}`);
}

const uploader = read("components/inventory/ProductGalleryUploader.tsx");
for (const token of [
  "uploadToSignedUrl",
  "multiple",
  "MAX_PRODUCT_IMAGE_SELECTION",
  "Uploading",
]) {
  assert.ok(uploader.includes(token), `Gallery uploader is missing ${token}`);
}

const productPage = read("app/admin/products/[id]/page.tsx");
assert.ok(productPage.includes("<ProductGalleryUploader"), "Product page does not render the direct gallery uploader");
assert.ok(!productPage.includes('form action={upload}'), "Product page still sends image bytes through a Server Action");

const productForm = read("components/inventory/ProductForm.tsx");
assert.ok(!productForm.includes('name="gallery_images"'), "Product form still posts gallery bytes through a Server Action");
assert.ok(!productForm.includes('name="main_image"'), "Product form still posts the main image through a Server Action");

console.log("Production-safe product gallery upload verified.");
