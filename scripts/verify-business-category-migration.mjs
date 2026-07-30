import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/202607300005_dynamic_business_categories.sql",
  import.meta.url,
);

const sql = await readFile(migrationUrl, "utf8");

const requiredPatterns = [
  [/create table (if not exists )?public\.business_categories/i, "business category table"],
  [/create table (if not exists )?public\.business_category_fields/i, "category field table"],
  [/add column if not exists business_category_id uuid/i, "business category foreign-key columns"],
  [/drop constraint if exists products_sen_business_category_check/i, "product legacy check removal"],
  [/drop constraint if exists product_categories_sen_business_category_check/i, "classification legacy check removal"],
  [/foreign key \(business_category_id\)[\s\S]*on delete restrict/i, "restrictive category foreign keys"],
  [/create or replace function public\.sync_business_category_name/i, "compatibility-name trigger"],
  [/create trigger sync_products_business_category_name/i, "product compatibility trigger"],
  [/create trigger sync_product_categories_business_category_name/i, "classification compatibility trigger"],
  [/enable row level security/i, "row-level security"],
  [/current_user_has_permission\('products\.view'\)/i, "staff read policy"],
  [/current_user_has_permission\('products\.edit'\)/i, "staff mutation policy"],
  [/Networking[\s\S]*#0D6EFD/i, "Networking seed"],
  [/Medical Equipment[\s\S]*#28A745/i, "Medical Equipment seed"],
  [/Energy[\s\S]*#FD7E14/i, "Energy seed"],
  [/Others[\s\S]*#6F42C1/i, "Others seed"],
  [/update public\.products[\s\S]*business_category_id/i, "product backfill"],
  [/update public\.product_categories[\s\S]*business_category_id/i, "classification backfill"],
  [/raise exception[\s\S]*business categor/i, "unresolved-row transaction guard"],
  [/insert into public\.business_category_fields/i, "default dynamic fields"],
  [/create unique index[\s\S]*business_categories[\s\S]*lower\(name\)/i, "case-insensitive name uniqueness"],
];

for (const [pattern, label] of requiredPatterns) {
  assert.match(sql, pattern, `Migration is missing ${label}.`);
}

assert.match(sql, /^\s*begin\s*;/i, "Migration must be transactional.");
assert.match(sql, /commit\s*;\s*$/i, "Migration must commit explicitly.");

console.log("Dynamic business-category migration verification passed.");

