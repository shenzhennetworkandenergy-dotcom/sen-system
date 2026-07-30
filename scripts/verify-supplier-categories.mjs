import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/202607300002_supplier_categories_and_codes.sql", root);
await access(migrationUrl);
const migration = await readFile(migrationUrl, "utf8");
const serviceRoleGrantMigrationUrl = new URL(
  "supabase/migrations/202607300003_supplier_categories_service_role_grant.sql",
  root,
);
await access(serviceRoleGrantMigrationUrl);
const serviceRoleGrantMigration = await readFile(serviceRoleGrantMigrationUrl, "utf8");

for (const required of [
  "create table public.supplier_categories",
  "supplier_category_id",
  "brand_id",
  "generate_supplier_code",
  "supplier_category_guard",
  "enable row level security",
  "suppliers.view",
  "suppliers.create",
  "suppliers.edit",
]) {
  assert.ok(migration.includes(required), `Missing migration requirement: ${required}`);
}
assert.doesNotMatch(migration, /category level[^;]*<=\s*3/i, "Category depth must not be limited to three.");
assert.match(migration, /with recursive/i, "Hierarchy must use recursive traversal.");
assert.match(migration, /cycle/i, "Hierarchy must explicitly guard against cycles.");
assert.match(
  serviceRoleGrantMigration,
  /grant select,\s*insert,\s*update,\s*delete\s+on table public\.supplier_categories\s+to service_role/i,
  "The server-side client must have explicit supplier-category table privileges.",
);

for (const route of [
  "app/admin/supplier-categories/page.tsx",
  "app/admin/supplier-categories/[id]/page.tsx",
]) {
  await access(new URL(route, root));
}

const [form, actions, listPage, detailPage, categoryDetailPage, categoryData] = await Promise.all([
  readFile(new URL("components/purchasing/SupplierForm.tsx", root), "utf8"),
  readFile(new URL("app/admin/purchasing/actions.ts", root), "utf8"),
  readFile(new URL("app/admin/suppliers/page.tsx", root), "utf8"),
  readFile(new URL("app/admin/suppliers/[id]/page.tsx", root), "utf8"),
  readFile(new URL("app/admin/supplier-categories/[id]/page.tsx", root), "utf8"),
  readFile(new URL("lib/purchasing/supplier-categories.ts", root), "utf8"),
]);

for (const removed of ["country_code", "payment_terms_days", "lead_time_days", "tax_registration"]) {
  assert.ok(!form.includes(`name="${removed}"`), `Removed supplier field is still rendered: ${removed}`);
}
assert.match(form, /supplier_category_id/);
assert.match(form, /brand_id/);
assert.match(form, /readOnly/);
assert.match(actions, /generate_supplier_code/);
assert.match(actions, /regenerateSupplierCodeAction/);
assert.match(listPage, /Supplier categories/);
assert.match(detailPage, /Regenerate supplier code/);
assert.match(categoryData, /getSuppliersForCategory/);
assert.match(categoryData, /\.eq\("supplier_category_id", categoryId\)/);
assert.match(categoryDetailPage, /Suppliers in this category/);
assert.match(categoryDetailPage, /supplier\.code/);
assert.match(categoryDetailPage, /supplier\.brand\?\.name/);
assert.match(categoryDetailPage, /No suppliers are assigned directly to this category/);

console.log("Supplier category verification passed.");
