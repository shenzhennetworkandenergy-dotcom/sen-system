import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const envText = await readFile(".env.local", "utf8").catch(() => "");
const fileEnv = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const env = { ...fileEnv, ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required.");
assert.ok(key, "A Supabase server credential is required.");

const migrationNames = (await readdir("supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
assert.equal(
  new Set(migrationNames.map((name) => name.slice(0, 12))).size,
  migrationNames.length,
  "Migration timestamps must be unique.",
);

const migrationText = (
  await Promise.all(
    migrationNames.map((name) => readFile(`supabase/migrations/${name}`, "utf8")),
  )
).join("\n");

for (const table of [
  "products",
  "product_categories",
  "business_categories",
  "business_category_fields",
  "inventory_balances",
  "sales_orders",
  "purchase_orders",
  "quotation_requests",
  "crm_leads",
  "hr_employee_records",
]) {
  const explicitRls = new RegExp(
    `alter table public\\.${table} enable row level security`,
    "i",
  ).test(migrationText);
  const loopRls = new RegExp(`['"]${table}['"]`, "i").test(migrationText)
    && /execute format\(['"]alter table public\.%I enable row level security/i.test(
      migrationText,
    );
  assert.ok(explicitRls || loopRls, `${table} must enable RLS in migration history.`);
}

for (const bucket of [
  "product-media",
  "profile-avatars",
  "support-attachments",
  "hr-documents",
]) {
  assert.ok(migrationText.includes(`'${bucket}'`), `Missing ${bucket} storage migration.`);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [
  categories,
  fields,
  productsWithoutCategory,
  classificationsWithoutCategory,
  buckets,
] = await Promise.all([
  db.from("business_categories").select("id,slug,is_active,sort_order"),
  db.from("business_category_fields").select("id,business_category_id"),
  db
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("business_category_id", null),
  db
    .from("product_categories")
    .select("id", { count: "exact", head: true })
    .is("business_category_id", null),
  db.storage.listBuckets(),
]);

for (const result of [categories, fields, productsWithoutCategory, classificationsWithoutCategory]) {
  assert.equal(result.error, null, result.error?.message);
}
assert.equal(buckets.error, null, buckets.error?.message);
assert.ok((categories.data ?? []).length >= 1, "At least one business category is required.");
assert.equal(productsWithoutCategory.count, 0, "Products contain orphaned business categories.");
assert.equal(
  classificationsWithoutCategory.count,
  0,
  "Product classifications contain orphaned business categories.",
);

const categoryIds = new Set((categories.data ?? []).map((row) => row.id));
for (const field of fields.data ?? []) {
  assert.ok(categoryIds.has(field.business_category_id), "Category field is orphaned.");
}

const bucketIds = new Set((buckets.data ?? []).map((bucket) => bucket.id));
for (const bucket of [
  "product-media",
  "profile-avatars",
  "support-attachments",
  "hr-documents",
]) {
  assert.ok(bucketIds.has(bucket), `Storage bucket ${bucket} is not provisioned.`);
}

console.log(
  `Production database verified: ${migrationNames.length} migrations, ${
    categories.data?.length ?? 0
  } business categories, ${fields.data?.length ?? 0} dynamic fields, no category orphans, and ${
    bucketIds.size
  } storage buckets.`,
);
