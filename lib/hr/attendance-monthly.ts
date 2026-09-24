export type MonthlyAttendanceStatus =
  | "present"
  | "absent"
  | "paid_leave"
  | "unpaid_leave"
  | "leave"
  | "holiday"
  | "weekend"
  | "not_recorded"
  | "recorded";

export type MonthlyAttendanceRow = {
  id: string;
  work_date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  timezone: string;
  check_in_variance_minutes: number | null;
};

export type MonthlyLeaveRow = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  hr_leave_types:
    | { name: string; code: string; is_paid: boolean }
    | Array<{ name: string; code: string; is_paid: boolean }>
    | null;
};

export type MonthlyScheduleRow = {
  weekday: number;
  is_working: boolean;
  timezone: string;
};

export type MonthlyAttendanceDay = {
  date: string;
  day: number;
  status: MonthlyAttendanceStatus;
  statusLabel: string;
  code: string;
  detail: string;
  isLate: boolean;
  isFuture: boolean;
};

export type MonthlyAttendanceSummary = {
  present: number;
  late: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  leave: number;
  holiday: number;
  weekend: number;
  notRecorded: number;
};

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function resolveAttendanceMonth(value: unknown, currentWorkDate: string) {
  const requested = String(value ?? "");
  return monthPattern.test(requested) ? requested : currentWorkDate.slice(0, 7);
}

export function getAttendanceMonthRange(month: string) {
  if (!monthPattern.test(month)) throw new Error("Attendance month is invalid.");
  const [year, monthNumber] = month.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(endDay).padStart(2, "0")}`,
  };
}

export function shiftAttendanceMonth(month: string, difference: number) {
  if (!monthPattern.test(month)) throw new Error("Attendance month is invalid.");
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + difference, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function leaveType(row: MonthlyLeaveRow) {
  return Array.isArray(row.hr_leave_types)
    ? row.hr_leave_types[0] ?? null
    : row.hr_leave_types;
}

function formatCheckIn(row: MonthlyAttendanceRow) {
  if (!row.check_in) return "Recorded";
  return new Intl.DateTimeFormat("en", {
    timeZone: row.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(row.check_in));
}

function recordedDay(row: MonthlyAttendanceRow): Omit<MonthlyAttendanceDay, "date" | "day" | "isFuture"> {
  const lateMinutes = Math.max(0, row.check_in_variance_minutes ?? 0);
  const isLate = row.status === "late" || lateMinutes > 0;
  if (["present", "late"].includes(row.status)) {
    return {
      status: "present",
      statusLabel: isLate ? "Present · Late" : "Present",
      code: "P",
      detail: isLate ? `+${lateMinutes}m late · ${formatCheckIn(row)}` : formatCheckIn(row),
      isLate,
    };
  }
  if (row.status === "absent") return { status: "absent", statusLabel: "Absent", code: "A", detail: "Absent", isLate: false };
  if (row.status === "holiday") return { status: "holiday", statusLabel: "Holiday", code: "H", detail: "Holiday", isLate: false };
  if (row.status === "leave") return { status: "leave", statusLabel: "Leave", code: "LV", detail: "Approved attendance leave", isLate: false };
  const label = row.status.replaceAll("_", " ");
  return { status: "recorded", statusLabel: label, code: row.status.slice(0, 2).toUpperCase(), detail: label, isLate };
}

export function buildMonthlyAttendance(input: {
  month: string;
  currentWorkDate: string;
  hireDate: string | null;
  attendance: MonthlyAttendanceRow[];
  approvedLeave: MonthlyLeaveRow[];
  schedules: MonthlyScheduleRow[];
}) {
  if (!datePattern.test(input.currentWorkDate)) throw new Error("Current work date is invalid.");
  const range = getAttendanceMonthRange(input.month);
  const attendanceByDate = new Map(input.attendance.map((row) => [row.work_date, row]));
  const scheduleByWeekday = new Map(input.schedules.map((row) => [row.weekday, row]));
  const approvedLeave = input.approvedLeave.filter((row) => row.status === "approved");

  const days = eachDate(range.startDate, range.endDate).map((date): MonthlyAttendanceDay => {
    const day = Number(date.slice(-2));
    const isFuture = date > input.currentWorkDate;
    const attendance = attendanceByDate.get(date);
    if (attendance) return { date, day, isFuture, ...recordedDay(attendance) };

    const leave = approvedLeave.find((row) => row.start_date <= date && row.end_date >= date);
    if (leave) {
      const type = leaveType(leave);
      if (type?.is_paid === true) return { date, day, status: "paid_leave", statusLabel: "Paid leave", code: "PL", detail: type.name, isLate: false, isFuture };
      if (type?.is_paid === false) return { date, day, status: "unpaid_leave", statusLabel: "Unpaid leave", code: "UL", detail: type.name, isLate: false, isFuture };
      return { date, day, status: "leave", statusLabel: "Leave", code: "LV", detail: type?.name ?? "Approved leave", isLate: false, isFuture };
    }

    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const schedule = scheduleByWeekday.get(weekday);
    if (schedule && !schedule.is_working) return { date, day, status: "weekend", statusLabel: "Weekend / off", code: "W", detail: "Weekly off", isLate: false, isFuture };

    const beforeHire = Boolean(input.hireDate && date < input.hireDate);
    return { date, day, status: "not_recorded", statusLabel: "Not recorded", code: "—", detail: isFuture ? "Future date" : beforeHire ? "Before joining" : "Not recorded", isLate: false, isFuture };
  });

  const summary: MonthlyAttendanceSummary = {
    present: days.filter((day) => day.status === "present").length,
    late: days.filter((day) => day.isLate).length,
    absent: days.filter((day) => day.status === "absent").length,
    paidLeave: days.filter((day) => day.status === "paid_leave").length,
    unpaidLeave: days.filter((day) => day.status === "unpaid_leave").length,
    leave: days.filter((day) => day.status === "leave").length,
    holiday: days.filter((day) => day.status === "holiday").length,
    weekend: days.filter((day) => day.status === "weekend").length,
    notRecorded: days.filter((day) => day.status === "not_recorded").length,
  };
  return { days, summary, range };
}
