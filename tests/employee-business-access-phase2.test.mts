import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root, "supabase/migrations/202610010005_employee_business_access_phase2.sql"), "utf8");
const helper = readFileSync(join(root, "lib/customers/employee-business-access.ts"), "utf8");
const action = readFileSync(join(root, "app/admin/users/employee-business-access-actions.ts"), "utf8");

test("phase 2 migration creates only employee business-category access metadata", () => {
  assert.match(migration, /create table if not exists public\.employee_business_category_access/);
  assert.match(migration, /employee_profile_id uuid not null references public\.profiles\(id\)/);
  assert.match(migration, /customer_business_category_id uuid not null references public\.customer_business_categories\(id\)/);
  assert.match(migration, /primary key \(employee_profile_id, customer_business_category_id\)/);
  assert.doesNotMatch(migration, /sales_orders|quotation_requests|work_scheduler_items|inventory|crm_companies/i);
});

test("phase 2 database guard keeps assignments employee-only", () => {
  assert.match(migration, /ensure_employee_business_access_profile/);
  assert.match(migration, /role = 'employee'/);
  assert.match(migration, /archived_at is null/);
});

test("phase 2 helper supports one category, multiple categories, removal, and reassignment", () => {
  assert.match(helper, /normalizeCategorySlugs/);
  assert.match(helper, /\.delete\(\)[\s\S]*\.eq\("employee_profile_id", employeeProfileId\)/);
  assert.match(helper, /if \(!categories\?\.length\) return/);
  assert.match(helper, /\.insert\(categories\.map/);
});

test("phase 2 mutation remains admin-only", () => {
  assert.match(action, /await requireProfile\(\["admin"\]\)/);
  assert.match(action, /persistEmployeeBusinessAccess/);
});
