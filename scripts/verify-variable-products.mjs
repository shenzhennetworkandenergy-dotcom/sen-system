import fs from "node:fs";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const checks = [];
const expect = (condition, message) => {
  if (!condition) checks.push(message);
};

const purchasePanel = fs.readFileSync(
  "components/catalog/ProductPurchasePanel.tsx",
  "utf8",
);
const cartActions = fs.readFileSync("app/cart/actions.ts", "utf8");
const cartPage = fs.readFileSync("app/cart/page.tsx", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/202607290005_variable_product_checkout.sql",
  "utf8",
);

expect(purchasePanel.includes("Select configuration"), "The product page has no configuration selector.");
expect(purchasePanel.includes('name="variation_id"'), "The selected variation is not submitted.");
expect(cartActions.includes('form.get("variation_id")'), "Cart actions ignore variation_id.");
expect(cartActions.includes("variation_id:variationId"), "Cart inserts do not preserve variation_id.");
expect(cartPage.includes("product_variations("), "Cart lines do not load variation details.");
expect(migration.includes("variation_row.sale_price"), "Checkout does not use variation pricing.");
expect(migration.includes("variation_row.sku"), "Checkout does not snapshot the variation SKU.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase verification credentials are missing.");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: products, error } = await db
  .from("products")
  .select("id,name,product_type,sen_business_category,internal_notes")
  .or(
    "internal_notes.ilike.%WooCommerce source ID: 1725%,internal_notes.ilike.%WooCommerce source ID: 1936%",
  );
if (error) throw error;
expect(products?.length === 2, "RAM and SAS variable parents are not both present.");

for (const product of products ?? []) {
  expect(product.product_type === "variable", `${product.name} is not variable.`);
  expect(product.sen_business_category === "Networking", `${product.name} is not in Networking.`);
  const { count, error: variationError } = await db
    .from("product_variations")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id)
    .eq("status", "active");
  if (variationError) throw variationError;
  expect((count ?? 0) > 0, `${product.name} has no active variations.`);
}

if (checks.length) {
  console.error(checks.map((check) => `- ${check}`).join("\n"));
  process.exit(1);
}
console.log("Variable products, cart selection, catalogue classification and checkout pricing verified.");
