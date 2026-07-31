import assert from "node:assert/strict";
import test from "node:test";

import {
  attendanceStatuses,
  calculateAttendanceVariance,
  formatAttendanceVariance,
  parseEmployeeSchedule,
  resolveAttendanceWorkDate,
} from "../lib/hr/attendance.ts";

test("manual overtime statuses remain accepted attendance choices", () => {
  assert.deepEqual(attendanceStatuses, [
    "present",
    "absent",
    "late",
    "half_day",
    "leave",
    "holiday",
    "remote",
    "overtime",
    "holiday_overtime",
  ]);
});

test("employee schedules require seven unique valid weekday rows", () => {
  const rows = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isWorking: weekday > 0 && weekday < 6,
    startTime: "09:00",
    endTime: "18:00",
    timezone: "Asia/Dhaka",
  }));

  assert.equal(parseEmployeeSchedule(rows).length, 7);
  assert.throws(
    () => parseEmployeeSchedule([...rows.slice(0, 6), rows[0]]),
    /one schedule row for every weekday/i,
  );
  assert.throws(
    () => parseEmployeeSchedule(rows.map((row, index) => index === 1 ? { ...row, startTime: "25:00" } : row)),
    /start time is invalid/i,
  );
  assert.throws(
    () => parseEmployeeSchedule(rows.map((row, index) => index === 1 ? { ...row, timezone: "Mars/Olympus" } : row)),
    /timezone is invalid/i,
  );
});

test("attendance variance preserves exact early and late minutes", () => {
  const result = calculateAttendanceVariance({
    workDate: "2026-07-31",
    timezone: "Asia/Dhaka",
    startTime: "09:00",
    endTime: "18:00",
    checkIn: "2026-07-31T02:50:00.000Z",
    checkOut: "2026-07-31T12:15:00.000Z",
  });

  assert.equal(result.scheduledStartAt, "2026-07-31T03:00:00.000Z");
  assert.equal(result.scheduledEndAt, "2026-07-31T12:00:00.000Z");
  assert.equal(result.checkInVarianceMinutes, -10);
  assert.equal(result.checkOutVarianceMinutes, 15);
});

test("overnight schedules move the scheduled end to the following day", () => {
  const result = calculateAttendanceVariance({
    workDate: "2026-07-31",
    timezone: "Asia/Dhaka",
    startTime: "22:00",
    endTime: "06:00",
    checkIn: "2026-07-31T16:05:00.000Z",
    checkOut: "2026-08-01T00:10:00.000Z",
  });

  assert.equal(result.checkInVarianceMinutes, 5);
  assert.equal(result.checkOutVarianceMinutes, 10);
  assert.equal(result.scheduledEndAt, "2026-08-01T00:00:00.000Z");
});

test("work dates are derived in the recorded timezone instead of UTC", () => {
  assert.equal(
    resolveAttendanceWorkDate("2026-07-30T18:30:00.000Z", "Asia/Dhaka"),
    "2026-07-31",
  );
  assert.equal(
    resolveAttendanceWorkDate("2026-07-31T00:30:00.000Z", "America/New_York"),
    "2026-07-30",
  );
});

test("variance labels respect grace without losing exact differences", () => {
  assert.equal(formatAttendanceVariance(-12, 5), "12 min early");
  assert.equal(formatAttendanceVariance(3, 5), "On time");
  assert.equal(formatAttendanceVariance(8, 5), "8 min late");
  assert.equal(formatAttendanceVariance(null, 5), "Not recorded");
});

