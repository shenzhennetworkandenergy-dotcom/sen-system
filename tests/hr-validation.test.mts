import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAttendanceInput,
  parseEmployeeInput,
  parseLeaveInput,
  parseMoney,
  parsePagination,
} from "../lib/hr/validation.ts";

test("money is non-negative and rounded to two decimals", () => {
  assert.equal(parseMoney("123.456"), 123.46);
  assert.throws(() => parseMoney("-1"));
});

test("pagination is bounded", () => {
  assert.deepEqual(parsePagination("0", "999"), { page: 1, pageSize: 100 });
});

test("employee dates and required fields are validated", () => {
  assert.throws(() => parseEmployeeInput({ profileId: "", jobTitle: "", hireDate: "" }));
  assert.equal(parseEmployeeInput({ profileId: "p", jobTitle: "Engineer", hireDate: "2026-01-01" }).jobTitle, "Engineer");
});

test("leave end cannot precede start", () => {
  assert.throws(() => parseLeaveInput({ leaveTypeId: "l", startDate: "2026-02-02", endDate: "2026-02-01", reason: "x" }));
});

test("attendance checkout cannot precede checkin", () => {
  assert.throws(() => parseAttendanceInput({ employeeRecordId: "e", workDate: "2026-01-01", status: "present", checkIn: "2026-01-01T10:00:00Z", checkOut: "2026-01-01T09:00:00Z" }));
});
