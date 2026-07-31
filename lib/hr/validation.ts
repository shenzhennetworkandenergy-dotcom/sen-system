import { normalizeCurrencyCode } from "../currency/currencies.ts";
import { attendanceStatuses, type AttendanceStatus, type EmployeeInput, type EmploymentStatus, type EmploymentType } from "./types.ts";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const attendanceStatusSet = new Set<AttendanceStatus>(attendanceStatuses);
const employmentTypes = new Set<EmploymentType>(["full_time","part_time","contract","intern"]);
const employmentStatuses = new Set<EmploymentStatus>(["active","probation","on_leave","terminated"]);

const required = (value: unknown, label: string) => {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
};
const optional = (value: unknown) => String(value ?? "").trim() || null;
const date = (value: unknown, label: string) => {
  const result = required(value, label);
  if (!datePattern.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw new Error(`${label} is invalid.`);
  return result;
};

export function parseMoney(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be a non-negative number.");
  return Math.round(amount * 100) / 100;
}

export function parsePagination(pageValue: unknown, pageSizeValue: unknown) {
  const page = Math.max(1, Math.floor(Number(pageValue) || 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(pageSizeValue) || 25)));
  return { page, pageSize };
}

export function parseEmployeeInput(input: Partial<EmployeeInput>) {
  const profileId = required(input.profileId, "Staff profile");
  const jobTitle = required(input.jobTitle, "Job title");
  const hireDate = date(input.hireDate, "Hire date");
  const employmentType = (input.employmentType ?? "full_time") as EmploymentType;
  const employmentStatus = (input.employmentStatus ?? "active") as EmploymentStatus;
  if (!employmentTypes.has(employmentType)) throw new Error("Employment type is invalid.");
  if (!employmentStatuses.has(employmentStatus)) throw new Error("Employment status is invalid.");
  const currency = normalizeCurrencyCode(input.salaryCurrency ?? "BDT");
  return {
    profileId, jobTitle, hireDate, employmentType, employmentStatus,
    departmentId: optional(input.departmentId), teamId: optional(input.teamId),
    designationId: optional(input.designationId), workLocationId: optional(input.workLocationId),
    managerProfileId: optional(input.managerProfileId),
    baseSalary: input.baseSalary === null || input.baseSalary === undefined || input.baseSalary === "" ? null : parseMoney(input.baseSalary),
    salaryCurrency: currency, emergencyName: optional(input.emergencyName), emergencyPhone: optional(input.emergencyPhone),
  };
}

export function parseLeaveInput(input: { leaveTypeId?: unknown; startDate?: unknown; endDate?: unknown; reason?: unknown }) {
  const leaveTypeId = required(input.leaveTypeId, "Leave type");
  const startDate = date(input.startDate, "Start date");
  const endDate = date(input.endDate, "End date");
  if (endDate < startDate) throw new Error("End date cannot be before start date.");
  const reason = required(input.reason, "Reason");
  if (reason.length < 3 || reason.length > 1000) throw new Error("Reason must be between 3 and 1000 characters.");
  return { leaveTypeId, startDate, endDate, reason };
}

export function parseAttendanceInput(input: {
  employeeRecordId?: unknown; workDate?: unknown; status?: unknown;
  checkIn?: unknown; checkOut?: unknown; notes?: unknown;
}) {
  const employeeRecordId = required(input.employeeRecordId, "Employee");
  const workDate = date(input.workDate, "Work date");
  const status = required(input.status, "Status") as AttendanceStatus;
  if (!attendanceStatusSet.has(status)) throw new Error("Attendance status is invalid.");
  const checkIn = optional(input.checkIn);
  const checkOut = optional(input.checkOut);
  if (checkIn && Number.isNaN(Date.parse(checkIn))) throw new Error("Check-in is invalid.");
  if (checkOut && Number.isNaN(Date.parse(checkOut))) throw new Error("Check-out is invalid.");
  if (checkIn && checkOut && Date.parse(checkOut) < Date.parse(checkIn)) throw new Error("Check-out cannot be before check-in.");
  return { employeeRecordId, workDate, status, checkIn, checkOut, notes: optional(input.notes) };
}
