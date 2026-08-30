import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildMonthlyAttendance, getAttendanceMonthRange, resolveAttendanceMonth, shiftAttendanceMonth } from "../lib/hr/attendance-monthly.ts";

const attendance = (overrides: Partial<Parameters<typeof buildMonthlyAttendance>[0]["attendance"][number]> = {}) => ({
  id: "attendance-1", work_date: "2026-08-24", status: "present", check_in: "2026-08-24T04:40:00.000Z",
  check_out: null, timezone: "Asia/Dhaka", check_in_variance_minutes: 40, ...overrides,
});

test("monthly range and navigation stay calendar bounded", () => {
  assert.deepEqual(getAttendanceMonthRange("2026-02"), { startDate: "2026-02-01", endDate: "2026-02-28" });
  assert.equal(resolveAttendanceMonth("invalid", "2026-08-30"), "2026-08");
  assert.equal(shiftAttendanceMonth("2026-01", -1), "2025-12");
});

test("present and late remain one present attendance day with a late indicator", () => {
  const result = buildMonthlyAttendance({ month: "2026-08", currentWorkDate: "2026-08-30", hireDate: "2026-01-01", attendance: [attendance()], approvedLeave: [], schedules: [] });
  const day = result.days.find((item) => item.date === "2026-08-24");
  assert.equal(day?.status, "present"); assert.equal(day?.isLate, true); assert.match(day?.detail ?? "", /\+40m late/i);
  assert.equal(result.summary.present, 1); assert.equal(result.summary.late, 1);
});

test("absence is explicit while missing past and future workdays remain not recorded", () => {
  const result = buildMonthlyAttendance({ month: "2026-08", currentWorkDate: "2026-08-20", hireDate: "2026-08-01", attendance: [attendance({ work_date: "2026-08-17", status: "absent", check_in: null, check_in_variance_minutes: null })], approvedLeave: [], schedules: [] });
  assert.equal(result.days.find((day) => day.date === "2026-08-17")?.status, "absent");
  assert.equal(result.days.find((day) => day.date === "2026-08-18")?.status, "not_recorded");
  assert.equal(result.days.find((day) => day.date === "2026-08-21")?.detail, "Future date");
});

test("approved leave uses its authoritative paid classification and weekly off uses the employee schedule", () => {
  const result = buildMonthlyAttendance({
    month: "2026-08", currentWorkDate: "2026-08-30", hireDate: "2026-01-01", attendance: [],
    approvedLeave: [{ id: "leave-1", start_date: "2026-08-10", end_date: "2026-08-10", status: "approved", hr_leave_types: { name: "Annual leave", code: "ANNUAL", is_paid: true } }],
    schedules: [{ weekday: 5, is_working: false, timezone: "Asia/Dhaka" }],
  });
  assert.equal(result.days.find((day) => day.date === "2026-08-10")?.status, "paid_leave");
  assert.equal(result.days.find((day) => day.date === "2026-08-07")?.status, "weekend");
});

test("Attendance page keeps write controls and history while monthly reads are self scoped and bounded", async () => {
  const [page, server, calendar] = await Promise.all([
    readFile("app/employee/hr/attendance/page.tsx", "utf8"),
    readFile("lib/hr/attendance-monthly.server.ts", "utf8"),
    readFile("components/hr/EmployeeAttendanceMonthlyCalendar.tsx", "utf8"),
  ]);
  assert.match(page, /AttendanceClockControls/); assert.match(page, /Request correction/); assert.match(page, /<table/);
  assert.match(page, /EmployeeAttendanceMonthlyCalendar/); assert.match(calendar, /Monthly summary/); assert.match(calendar, /Previous month/);
  assert.match(server, /requireEmployeeHrRecord/); assert.doesNotMatch(server, /employee_id.*requested|searchParams.*employee/i);
  assert.match(server, /\.gte\("work_date", startDate\)/); assert.match(server, /\.lte\("work_date", endDate\)/);
  assert.match(server, /\.eq\("employee_record_id", employeeId\)/);
});
