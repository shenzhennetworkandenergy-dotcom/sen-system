import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/202607300004_integrated_hr_management.sql", import.meta.url);
const migration = await readFile(migrationPath, "utf8").catch(() => "");

const requiredTables = [
  "hr_employee_profiles", "hr_teams", "hr_designations", "hr_leave_types",
  "hr_leave_balances", "hr_attendance_correction_requests", "hr_payroll_records",
  "hr_payroll_components", "hr_performance_reviews", "hr_performance_goals",
  "hr_employee_documents", "hr_attendance_devices", "hr_device_employee_mappings",
  "hr_attendance_events", "hr_settings",
];
for (const table of requiredTables) {
  assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"), `missing ${table}`);
  assert.match(migration, new RegExp(`['"]?${table}['"]?`), `RLS registry missing for ${table}`);
}
assert.match(migration, /enable row level security/i);

for (const rpc of [
  "hr_upsert_employee", "hr_archive_employee", "hr_review_leave",
  "hr_review_attendance_correction", "hr_record_attendance",
]) {
  assert.match(migration, new RegExp(`function public\\.${rpc}\\b`, "i"), `missing RPC ${rpc}`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}`, "i"), `missing RPC revoke ${rpc}`);
}

assert.match(migration, /unique\s*\(device_id,event_uid\)/i);
assert.match(migration, /check\s*\(event_type in\s*\('check_in','check_out'\)\)/i);
assert.doesNotMatch(migration, /fingerprint_image|face_image|biometric_template/i);
assert.match(migration, /insert into public\.customer_notifications/i);
assert.match(migration, /create or replace function public\.is_hr_admin/i);
assert.match(migration, /hr employee reads own profile/i);
assert.match(migration, /hr admin manages attendance/i);
assert.match(migration, /hr-documents/i);

const employeeDirectory = await readFile(new URL("../app/admin/hr/employees/page.tsx", import.meta.url), "utf8");
const organizationPage = await readFile(new URL("../app/admin/hr/departments/page.tsx", import.meta.url), "utf8");
const employeeDetail = await readFile(new URL("../app/admin/hr/employees/[id]/page.tsx", import.meta.url), "utf8");
const employeeReport = await readFile(new URL("../app/admin/hr/reports/employees.csv/route.ts", import.meta.url), "utf8").catch(() => "");
const departmentReport = await readFile(new URL("../app/admin/hr/reports/departments.csv/route.ts", import.meta.url), "utf8").catch(() => "");
const printReport = await readFile(new URL("../app/admin/hr/reports/print/page.tsx", import.meta.url), "utf8").catch(() => "");
const printReportButton = await readFile(new URL("../components/hr/PrintReportButton.tsx", import.meta.url), "utf8").catch(() => "");
const attendanceReport = await readFile(new URL("../app/admin/hr/reports/attendance.csv/route.ts", import.meta.url), "utf8").catch(() => "");
const operationalQueries = await readFile(new URL("../lib/hr/operational.ts", import.meta.url), "utf8");

assert.match(employeeDirectory, /Name, email, phone, number or job title/i);
assert.match(employeeDirectory, /name="designation"/);
assert.match(employeeDirectory, /name="location"/);
assert.match(organizationPage, /toggleOrganizationAction/);
assert.match(employeeDetail, /\/admin\/hr\/documents\/\$\{String\(item\.id\)\}/);
assert.match(employeeReport, /requireHrAdmin/);
assert.match(employeeReport, /csvResponse/);
assert.match(departmentReport, /requireHrAdmin/);
assert.match(departmentReport, /csvResponse/);
assert.match(printReport, /PrintReportButton/);
assert.match(printReportButton, /Print or save as PDF/i);
assert.match(attendanceReport, /searchParams/);
assert.match(attendanceReport, /department/);
assert.doesNotMatch(
  operationalQueries,
  /profiles:profile_id\(/,
  "HR queries must use the explicit employee-profile foreign key because hr_employee_records has multiple profile relationships",
);
assert.match(operationalQueries, /profiles!hr_employee_records_profile_id_fkey/);
assert.doesNotMatch(
  operationalQueries,
  /country_name/,
  "HR employee queries must use the deployed profiles.country column",
);

console.log("HR management migration verification passed.");
