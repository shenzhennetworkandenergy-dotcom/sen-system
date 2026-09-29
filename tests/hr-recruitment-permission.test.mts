import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAccessEmployeeRecruitment,
  RECRUITMENT_ACCESS_PERMISSION,
} from "../lib/hr/recruitment-access-policy.ts";

test("Recruitment access is opt-in and employee-only", () => {
  assert.equal(RECRUITMENT_ACCESS_PERMISSION, "hr.access_recruitment");
  assert.equal(canAccessEmployeeRecruitment("employee", "active", []), false);
  assert.equal(canAccessEmployeeRecruitment("employee", "active", [RECRUITMENT_ACCESS_PERMISSION]), true);
  assert.equal(canAccessEmployeeRecruitment("employee", "suspended", [RECRUITMENT_ACCESS_PERMISSION]), false);
  assert.equal(canAccessEmployeeRecruitment("customer", "active", [RECRUITMENT_ACCESS_PERMISSION]), false);
  assert.equal(canAccessEmployeeRecruitment("admin", "active", [RECRUITMENT_ACCESS_PERMISSION]), false);
  assert.equal(canAccessEmployeeRecruitment(undefined, undefined, []), false);
});

test("Employee HR tab is permission-gated", () => {
  const shell = readFileSync("components/hr/EmployeeHrShell.tsx", "utf8");
  assert.match(shell, /matrix\.effectiveKeys\.includes\(RECRUITMENT_ACCESS_PERMISSION\)/);
  assert.match(shell, /routes\.employeeHrRecruitment/);
});

test("Recruitment page data and both write actions enforce server access", () => {
  const data = readFileSync("lib/hr/recruitment.ts", "utf8");
  const actions = readFileSync("app/employee/hr/recruitment/actions.ts", "utf8");
  assert.match(data, /requireEmployeeRecruitmentAccess\(\)/);
  assert.equal((actions.match(/requireEmployeeRecruitmentAccess\(\)/g) ?? []).length, 2);
  assert.doesNotMatch(actions, /requireEmployeeHrRecord\(\)/);
});

test("Permission migration uses existing catalogue and protects Recruitment RLS only", () => {
  const migration = readFileSync(
    "supabase/migrations/202609270002_hr_recruitment_employee_permission.sql",
    "utf8",
  );
  assert.match(migration, /insert into public\.permissions/);
  assert.match(migration, /module\.key = 'hr'/);
  assert.match(migration, /'hr\.access_recruitment'/);
  assert.doesNotMatch(migration, /permission_template_items/);
  assert.doesNotMatch(migration, /insert into public\.permission_templates/);
  assert.match(migration, /on public\.hr_recruitment_processes/);
  assert.match(migration, /on public\.hr_recruitment_term_acceptances/);
});
