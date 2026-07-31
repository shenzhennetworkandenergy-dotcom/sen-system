import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { getSelfAttendanceAvailability } from "../lib/hr/self-attendance.ts";

test("employee attendance controls follow the valid clocking sequence", () => {
  assert.deepEqual(getSelfAttendanceAvailability(null), {
    canCheckIn: true,
    canCheckOut: false,
    state: "not_checked_in",
  });
  assert.deepEqual(
    getSelfAttendanceAvailability({
      check_in: "2026-07-31T03:00:00.000Z",
      check_out: null,
    }),
    { canCheckIn: false, canCheckOut: true, state: "checked_in" },
  );
  assert.deepEqual(
    getSelfAttendanceAvailability({
      check_in: "2026-07-31T03:00:00.000Z",
      check_out: "2026-07-31T12:00:00.000Z",
    }),
    { canCheckIn: false, canCheckOut: false, state: "checked_out" },
  );
});

test("self attendance migration uses server time and preserves device-ready sources", async () => {
  const migrations = await readdir("supabase/migrations");
  const name = migrations.find((item) => item.includes("employee_self_attendance"));
  assert.ok(name, "Employee self-attendance migration is missing.");

  const migration = await readFile(`supabase/migrations/${name}`, "utf8");
  assert.match(migration, /hr_record_self_attendance/i);
  assert.match(migration, /clock_timestamp\s*\(\s*\)/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /self_service/i);
  assert.match(migration, /fingerprint|camera|device/i);
  assert.match(migration, /hr_apply_device_attendance_event/i);
  assert.match(migration, /non-working day/i);
  assert.match(migration, /resolved_work_date\s*-\s*1/i);
  assert.doesNotMatch(
    migration,
    /resolved_timezone\s*:=\s*coalesce\([\s\S]{0,160}requested_timezone/i,
  );
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.match(migration, /revoke all[\s\S]*authenticated/i);

  const reloadName = migrations.find((item) =>
    item.includes("reload_attendance_rpc_schema"),
  );
  assert.ok(reloadName, "Attendance RPC schema-cache reload migration is missing.");
  const reloadMigration = await readFile(
    `supabase/migrations/${reloadName}`,
    "utf8",
  );
  assert.match(reloadMigration, /notify\s+pgrst\s*,\s*'reload schema'/i);
});

test("attendance page exposes automatic-timezone check-in and check-out controls", async () => {
  const [page, actions, control, deviceRoute] = await Promise.all([
    readFile("app/employee/hr/attendance/page.tsx", "utf8"),
    readFile("app/employee/hr/actions.ts", "utf8"),
    readFile("components/hr/AttendanceClockControls.tsx", "utf8"),
    readFile("app/api/hr/attendance-events/route.ts", "utf8"),
  ]);

  assert.match(page, /AttendanceClockControls/);
  assert.match(actions, /recordSelfAttendanceAction/);
  assert.match(actions, /requireEmployeeHrRecord/);
  assert.match(actions, /hr_record_self_attendance/);
  assert.match(control, /resolvedOptions\(\)\.timeZone/);
  assert.match(control, /Check in/);
  assert.match(control, /Check out/);
  assert.match(page, /openAttendance/);
  assert.match(deviceRoute, /hr_apply_device_attendance_event/);
  assert.doesNotMatch(deviceRoute, /from\("hr_attendance"\)[\s\S]*\.upsert/);
});
