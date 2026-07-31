import {
  attendanceStatuses,
  type EmployeeScheduleRow,
} from "./types.ts";

export { attendanceStatuses };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(value: unknown): value is string {
  const timezone = String(value ?? "").trim();
  if (!timezone || timezone.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function parseEmployeeSchedule(input: unknown): EmployeeScheduleRow[] {
  if (!Array.isArray(input) || input.length !== 7) {
    throw new Error("Provide one schedule row for every weekday.");
  }

  const rows = input.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Employee schedule row is invalid.");
    }
    const source = item as Record<string, unknown>;
    const weekday = Number(source.weekday);
    const isWorking = source.isWorking === true;
    const startTime = String(source.startTime ?? "").trim();
    const endTime = String(source.endTime ?? "").trim();
    const timezone = String(source.timezone ?? "").trim();
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error("Employee schedule weekday is invalid.");
    }
    if (!timePattern.test(startTime)) {
      throw new Error("Employee schedule start time is invalid.");
    }
    if (!timePattern.test(endTime)) {
      throw new Error("Employee schedule end time is invalid.");
    }
    if (!isValidTimeZone(timezone)) {
      throw new Error("Employee schedule timezone is invalid.");
    }
    return { weekday, isWorking, startTime, endTime, timezone };
  });

  if (new Set(rows.map((row) => row.weekday)).size !== 7) {
    throw new Error("Provide one schedule row for every weekday.");
  }
  return rows.sort((left, right) => left.weekday - right.weekday);
}

function partsInTimeZone(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function addDays(workDate: string, days: number) {
  const date = new Date(`${workDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function zonedLocalDateTimeToIso(
  workDate: string,
  localTime: string,
  timezone: string,
  dayOffset = 0,
) {
  if (!datePattern.test(workDate) || Number.isNaN(Date.parse(`${workDate}T00:00:00Z`))) {
    throw new Error("Work date is invalid.");
  }
  if (!timePattern.test(localTime)) throw new Error("Schedule time is invalid.");
  if (!isValidTimeZone(timezone)) throw new Error("Attendance timezone is invalid.");
  const effectiveDate = addDays(workDate, dayOffset);
  const [year, month, day] = effectiveDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsInTimeZone(guess, timezone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = target - represented;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess).toISOString();
}

export function resolveAttendanceWorkDate(instant: string, timezone: string) {
  const timestamp = Date.parse(instant);
  if (Number.isNaN(timestamp)) throw new Error("Attendance timestamp is invalid.");
  if (!isValidTimeZone(timezone)) throw new Error("Attendance timezone is invalid.");
  const parts = partsInTimeZone(timestamp, timezone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function calculateAttendanceVariance(input: {
  workDate: string;
  timezone: string;
  startTime: string;
  endTime: string;
  checkIn?: string | null;
  checkOut?: string | null;
}) {
  const overnight = input.endTime <= input.startTime;
  const scheduledStartAt = zonedLocalDateTimeToIso(
    input.workDate,
    input.startTime,
    input.timezone,
  );
  const scheduledEndAt = zonedLocalDateTimeToIso(
    input.workDate,
    input.endTime,
    input.timezone,
    overnight ? 1 : 0,
  );
  const difference = (actual: string | null | undefined, scheduled: string) => {
    if (!actual) return null;
    const timestamp = Date.parse(actual);
    if (Number.isNaN(timestamp)) throw new Error("Attendance timestamp is invalid.");
    return Math.round((timestamp - Date.parse(scheduled)) / 60_000);
  };
  return {
    scheduledStartAt,
    scheduledEndAt,
    checkInVarianceMinutes: difference(input.checkIn, scheduledStartAt),
    checkOutVarianceMinutes: difference(input.checkOut, scheduledEndAt),
  };
}

export function formatAttendanceVariance(
  minutes: number | null | undefined,
  graceMinutes = 0,
) {
  if (minutes === null || minutes === undefined) return "Not recorded";
  if (Math.abs(minutes) <= Math.max(0, graceMinutes)) return "On time";
  return minutes < 0
    ? `${Math.abs(minutes)} min early`
    : `${minutes} min late`;
}
