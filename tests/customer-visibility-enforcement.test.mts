import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/202611120001_customer_visibility_enforcement.sql");
const visibility = read("lib/customers/visibility.ts");

test("database visibility grants admins all active customers and employees only category intersections", () => {
  assert.match(migration, /actor\.role = 'admin'/);
  assert.match(migration, /actor\.role = 'employee'/);
  assert.match(migration, /employee_business_category_access employee_access/);
  assert.match(migration, /customer_business_category_assignments customer_access/);
  assert.match(migration, /customer_access\.customer_business_category_id = employee_access\.customer_business_category_id/);
  assert.match(migration, /customer_access\.customer_profile_id = customer\.id/);
  assert.match(migration, /category\.is_active = true/);
  assert.match(migration, /customer\.status = 'active'/);
  assert.match(migration, /customer\.archived_at is null/);
});

test("visibility functions are service-only and fail closed for employees without assignments", () => {
  assert.match(migration, /revoke all on function public\.customer_is_visible_to_actor\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.visible_customer_profile_ids\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.customer_is_visible_to_actor\(uuid, uuid\) to service_role/);
  assert.doesNotMatch(migration, /left join public\.employee_business_category_access/i);
  assert.match(visibility, /if \(actor\.role !== "employee" \|\| actor\.status !== "active"\) return \[\]/);
  assert.match(visibility, /visibilityFunctionIsUnavailable/);
  assert.match(visibility, /getVisibleCustomerIdsFromAssignments/);
});

test("customer selectors use the central visibility scope", () => {
  for (const path of [
    "lib/orders/data.ts",
    "lib/quotations/customer-options.ts",
    "app/admin/quotations/new/page.tsx",
    "lib/sales/data.ts",
    "lib/work-scheduler/data.ts",
  ]) {
    assert.match(read(path), /getVisibleCustomerIds/, `${path} must scope customer options`);
  }
});

test("customer-using mutations re-check visibility on the server", () => {
  for (const path of [
    "app/admin/orders/actions.ts",
    "app/admin/sales/actions.ts",
    "app/admin/quotations/actions.ts",
    "app/admin/work-scheduler/actions.ts",
  ]) {
    assert.match(read(path), /assertCustomerVisibleToActor/, `${path} must prevent customer ID tampering`);
  }
});

test("employees can classify a new Sale customer only within their assigned categories", () => {
  const saleAction = read("app/admin/sales/actions.ts");
  const salePage = read("app/admin/sales/new/page.tsx");
  assert.match(visibility, /assertCustomerCategoriesAssignableToActor/);
  assert.match(saleAction, /assertCustomerCategoriesAssignableToActor\(profile, categorySlugs\)/);
  assert.match(salePage, /getAssignableCustomerCategorySlugs\(profile\)/);
  assert.match(salePage, /assignableCategorySlugs\.includes\(category\.slug\)/);
});
