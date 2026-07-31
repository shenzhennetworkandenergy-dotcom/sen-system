import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeFiles = [
  "app/api/admin/catalog/categories/route.ts",
  "app/admin/catalog-actions.ts",
  "components/inventory/ProductForm.tsx",
  "components/home/BusinessCategories.tsx",
  "config/site.ts",
  "lib/inventory/validation.ts",
  "scripts/import-woocommerce-products.mjs",
];

const sources = Object.fromEntries(
  await Promise.all(
    runtimeFiles.map(async (file) => [file, await readFile(file, "utf8")]),
  ),
);
const combined = Object.values(sources).join("\n");

assert.doesNotMatch(
  combined,
  /\[\s*["']Networking["']\s*,\s*["']Energy["']\s*,\s*["']Medical Equipment["']\s*,\s*["']Others["']\s*\]/,
  "Runtime code still contains the four-category whitelist.",
);
assert.doesNotMatch(
  sources["app/api/admin/catalog/categories/route.ts"],
  /const businessCategories\s*=/,
  "Inline product-category creation still uses a hardcoded business-category list.",
);
assert.match(
  sources["app/api/admin/catalog/categories/route.ts"],
  /businessCategoryId/,
  "Inline product-category creation does not accept a business-category ID.",
);
assert.match(
  sources["components/inventory/ProductForm.tsx"],
  /name="business_category_id"/,
  "The product form does not submit the database business-category ID.",
);
assert.match(
  sources["components/home/BusinessCategories.tsx"],
  /getBusinessCategories/,
  "The homepage is not loading business categories from the database.",
);
assert.doesNotMatch(
  sources["config/site.ts"],
  /businessCategories\s*:/,
  "Site configuration still owns a static business-category list.",
);
assert.match(
  sources["scripts/import-woocommerce-products.mjs"],
  /business_categories/,
  "WooCommerce imports do not resolve the database business category.",
);

console.log("Dynamic business-category runtime verification passed.");

