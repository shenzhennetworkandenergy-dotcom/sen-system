import assert from "node:assert/strict";
import test from "node:test";

import {
  WORK_SCHEDULER_PERMISSION,
  buildOccurrenceDates,
  rotationEmployeeForOccurrence,
  workSchedulerDateLabel,
} from "../lib/work-scheduler/domain.ts";

import { readFileSync } from "node:fs";

test("Work Scheduler uses the isolated management permission and Dhaka dates", () => {
  assert.equal(WORK_SCHEDULER_PERMISSION, "work_scheduler.manage");
  assert.equal(workSchedulerDateLabel("2026-09-30", 1), "2026-10-01");
});

test("one-time, daily, weekly and selected-weekday schedules are deterministic", () => {
  assert.deepEqual(buildOccurrenceDates({ type: "ONE_TIME", start: "2026-09-30", end: "2026-09-30" }), ["2026-09-30"]);
  assert.deepEqual(buildOccurrenceDates({ type: "DAILY", start: "2026-09-29", end: "2026-10-01" }), ["2026-09-29", "2026-09-30", "2026-10-01"]);
  assert.deepEqual(buildOccurrenceDates({ type: "WEEKLY", start: "2026-09-30", end: "2026-10-15" }), ["2026-09-30", "2026-10-07", "2026-10-14"]);
  assert.deepEqual(buildOccurrenceDates({ type: "SELECTED_WEEKDAYS", start: "2026-09-28", end: "2026-10-04", weekdays: [0, 2, 4] }), ["2026-09-28", "2026-09-30", "2026-10-02"]);
});

test("rotation wraps by occurrence index, independent of session state", () => {
  const members = ["employee-a", "employee-b", "employee-c"];
  assert.equal(rotationEmployeeForOccurrence(members, 0), "employee-a");
  assert.equal(rotationEmployeeForOccurrence(members, 1), "employee-b");
  assert.equal(rotationEmployeeForOccurrence(members, 2), "employee-c");
  assert.equal(rotationEmployeeForOccurrence(members, 3), "employee-a");
});

test("empty rotation never produces an unsafe assignment", () => {
  assert.equal(rotationEmployeeForOccurrence([], 0), null);
});

test("Work Scheduler migration is isolated and enforces the core safety rules", () => {
  const migration = readFileSync("supabase/migrations/202609300001_work_scheduler_v1.sql", "utf8");
  for (const table of ["work_scheduler_items", "work_scheduler_schedules", "work_scheduler_rotation_members", "work_scheduler_assignments"]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /unique \(schedule_id, occurrence_date\)/);
  assert.match(migration, /current_user_has_permission\('work_scheduler\.manage'\)/);
  assert.match(migration, /Asia\/Dhaka/);
  assert.doesNotMatch(migration, /sales_orders|inventory_movements|attendance|leave_applications|cashbook/i);
});

test("Work Scheduler routes and actions retain server-side ownership guards", () => {
  const employeePage = readFileSync("app/employee/work/[assignmentId]/page.tsx", "utf8");
  const employeeAction = readFileSync("app/employee/work/actions.ts", "utf8");
  const adminPage = readFileSync("app/admin/work-scheduler/page.tsx", "utf8");
  assert.match(employeePage, /requireProfile\(\["employee"\]\)/);
  assert.match(employeePage, /eq\("effective_profile_id", profile\.id\)/);
  assert.match(employeeAction, /eq\("effective_profile_id", profile\.id\)/);
  assert.match(adminPage, /requirePermission\("work_scheduler\.manage"\)/);
});

test("Work Scheduler create flow keeps non-weekday arrays empty and uses explicit employee selection", () => {
  const action = readFileSync("app/admin/work-scheduler/actions.ts", "utf8");
  const form = readFileSync("components/work-scheduler/WorkSchedulerCreateForm.tsx", "utf8");
  assert.match(action, /filter\(Boolean\)\.map\(Number\)/);
  assert.match(action, /rotation_enabled/);
  assert.match(form, /Assigned Employee/);
  assert.match(form, /Use employee rotation/);
});

test("Work Scheduler assignment rows preserve assignment ids when adding item details", () => {
  const data = readFileSync("lib/work-scheduler/data.ts", "utf8");
  assert.match(data, /title: item\?\.title/);
  assert.doesNotMatch(data, /\.\.\.\(byId\.get\(row\.work_item_id\)/);
});

test("Work Scheduler reusable titles are isolated, normalized and server-authorized", () => {
  const migration = readFileSync("supabase/migrations/202610010001_work_scheduler_titles.sql", "utf8");
  const action = readFileSync("app/admin/work-scheduler/actions.ts", "utf8");
  const form = readFileSync("components/work-scheduler/WorkSchedulerCreateForm.tsx", "utf8");
  assert.match(migration, /create table if not exists public\.work_scheduler_titles/);
  assert.match(migration, /normalized_title text not null unique/);
  assert.match(migration, /current_user_has_permission\('work_scheduler\.manage'\)/);
  assert.match(action, /createWorkSchedulerTitleAction/);
  assert.match(action, /normalizeTitle/);
  assert.match(action, /title_id/);
  assert.match(form, /Select reusable work title/);
  assert.match(form, /createWorkSchedulerTitleAction/);
});

test("Employee pending work count is status and effective-assignee based", () => {
  const data = readFileSync("lib/work-scheduler/data.ts", "utf8");
  const shell = readFileSync("components/dashboard/Shell.tsx", "utf8");
  assert.match(data, /getEmployeePendingWorkCount/);
  assert.match(data, /eq\("effective_profile_id", profileId\)/);
  assert.match(data, /eq\("status", "PENDING"\)/);
  assert.match(shell, /"employee-work"/);
});

test("My Work badge keeps the server Work Scheduler count when inventory badges refresh", () => {
  const navigation = readFileSync("components/dashboard/DashboardNavigation.tsx", "utf8");
  assert.match(navigation, /\{\.\.\.workCounts,\.\.\.\(workCountsEndpoint\?liveWorkCounts:\{\}\)\}/);
  assert.match(navigation, /setLiveWorkCounts\(workCounts\)/);
  assert.match(navigation, /count>0\?/);
});

test("Employee Work Scheduler status colors distinguish pending, completed and unable states", () => {
  const page = readFileSync("app/employee/work/page.tsx", "utf8");
  assert.match(page, /PENDING: "border-red-200 bg-red-50 text-red-800"/);
  assert.match(page, /COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800"/);
  assert.match(page, /UNABLE_TO_COMPLETE: "border-rose-200 bg-rose-50 text-rose-800"/);
  assert.match(page, /border-red-200 bg-red-50 px-3 py-1 text-sm font-black text-red-800.*pending/);
});

test("Employee My Work hero pending card has high-contrast styling", () => {
  const page = readFileSync("app/employee/work/page.tsx", "utf8");
  assert.match(page, /border-white\/80 bg-white p-5/);
  assert.match(page, /text-slate-700.*>Today</);
  assert.match(page, /text-4xl font-black text-red-700">\{pending\}/);
  assert.match(page, /text-sm font-semibold text-red-700">pending/);
});

test("Delivery customer linking is Work Scheduler-only and snapshots CRM display data", () => {
  const migration = readFileSync("supabase/migrations/202610010002_work_scheduler_customer_delivery.sql", "utf8");
  const action = readFileSync("app/admin/work-scheduler/actions.ts", "utf8");
  const form = readFileSync("components/work-scheduler/WorkSchedulerCreateForm.tsx", "utf8");
  const data = readFileSync("lib/work-scheduler/data.ts", "utf8");
  const correction = readFileSync("supabase/migrations/202610010003_work_scheduler_customer_profile_reference.sql", "utf8");
  assert.match(migration, /customer_id uuid references public\.crm_companies/);
  assert.match(correction, /references public\.profiles/);
  assert.match(migration, /customer_name_snapshot/);
  assert.match(action, /from\("profiles"\)/);
  assert.match(action, /customer_name_snapshot/);
  assert.match(form, /Related To/);
  assert.match(form, /CustomerTypeahead/);
  assert.match(form, /PROJECT_SITE/);
  assert.match(data, /customer_contact_snapshot/);
});
