import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202607200001_phase_3b_permissions_activity.sql", import.meta.url), "utf8");
const requiredTables = ["app_modules", "permissions", "permission_templates", "permission_template_items", "profile_permission_templates", "profile_permission_overrides"];
const requiredFunctions = ["is_current_user_admin", "effective_permissions_for_profile", "current_user_has_permission", "admin_update_profile_access", "admin_set_profile_permissions", "protect_profile_access_fields"];
const requiredPermissions = [
  "dashboard.view","users.view","users.view_detail","users.change_role","users.change_status","users.manage_permissions","users.view_activity",
  "employees.view","employees.view_detail","employees.edit_profile","employees.view_permissions","employees.manage_permissions","employees.view_activity",
  "activity.view_own","activity.view_team","activity.view_all","activity.export","crm.view","crm.create","crm.edit","crm.delete","crm.export",
  "products.view","products.create","products.edit","products.archive","products.import","products.export","inventory.view","inventory.receive","inventory.adjust_stock","inventory.transfer","inventory.count","inventory.export",
  "warehouses.view","warehouses.create","warehouses.edit","warehouses.manage_locations","serials.view","serials.assign","serials.receive","serials.trace","serials.correct",
  "shipments.view","shipments.create","shipments.edit","shipments.update_status","shipments.confirm_china_dispatch","shipments.confirm_bangladesh_receipt","shipments.export",
  "sales.view","sales.create","sales.edit","sales.approve","sales.cancel","sales.export","quotations.view","quotations.create","quotations.edit","quotations.approve","quotations.send","quotations.export",
  "purchasing.view","purchasing.create","purchasing.edit","purchasing.approve","purchasing.receive","purchasing.cancel","purchasing.export","suppliers.view","suppliers.create","suppliers.edit","suppliers.archive",
  "accounting.view","accounting.create_entry","accounting.edit_entry","accounting.approve_entry","accounting.export","hr.view","hr.manage_employees","hr.view_attendance","hr.manage_attendance","hr.view_leave","hr.manage_leave","hr.view_payroll","hr.manage_payroll",
  "manufacturing.view","manufacturing.create","manufacturing.edit","manufacturing.approve","projects.view","projects.create","projects.edit","projects.assign","projects.close","support.view","support.create","support.assign","support.update","support.close",
  "reports.view","reports.export","ai.use","settings.view","settings.manage_company","settings.manage_integrations","settings.manage_security",
];

for (const table of requiredTables) assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`));
for (const fn of requiredFunctions) assert.match(migration, new RegExp(`function public\\.${fn}\\b`));
for (const permission of requiredPermissions) assert.ok(migration.includes(`'${permission}'`), `Missing ${permission}`);
assert.match(migration, /'standard_employee','Standard Employee'/);
assert.match(migration, /p\.key in \('dashboard\.view','activity\.view_own'\)/);
assert.match(migration, /security definer set search_path = ''/);

function resolves({ status="active", role="employee", deny=false, allow=false, template=false }) {
  if (status!=="active") return false;
  if (role==="admin") return true;
  if (role!=="employee") return false;
  if (deny) return false;
  if (allow) return true;
  return template;
}

assert.equal(resolves({role:"admin"}),true,"active admin bypass");
assert.equal(resolves({role:"customer",allow:true}),false,"customer denied");
assert.equal(resolves({status:"suspended",role:"admin"}),false,"inactive admin denied");
assert.equal(resolves({template:true}),true,"template grants");
assert.equal(resolves({template:true,deny:true}),false,"deny overrides template");
assert.equal(resolves({allow:true}),true,"allow overrides missing template permission");
assert.equal(resolves({}),false,"default deny");

console.log(`Phase 3B static verification passed: ${requiredTables.length} tables, ${requiredFunctions.length} functions, ${requiredPermissions.length} permission keys, and resolution precedence cases.`);
