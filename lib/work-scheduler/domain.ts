export const WORK_SCHEDULER_PERMISSION = "work_scheduler.manage";
export const WORK_SCHEDULER_TIMEZONE = "Asia/Dhaka";
export const WORK_SCHEDULER_TYPES = ["GENERAL", "CUSTOMER_FOLLOW_UP", "PRODUCT_DELIVERY", "PROJECT_SITE_VISIT", "OTHER"] as const;
export const WORK_SCHEDULER_SCHEDULE_TYPES = ["ONE_TIME", "DAILY", "WEEKLY", "SELECTED_WEEKDAYS"] as const;
export const WORK_SCHEDULER_STATUSES = ["PENDING", "COMPLETED", "UNABLE_TO_COMPLETE"] as const;

export type WorkSchedulerScheduleType = (typeof WORK_SCHEDULER_SCHEDULE_TYPES)[number];

type OccurrenceRule = {
  type: WorkSchedulerScheduleType;
  start: string;
  end: string;
  weekdays?: number[];
};

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid Work Scheduler date.");
  return date;
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function workSchedulerDateLabel(date: string, offsetDays = 0) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return dateValue(value);
}

function mondayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

export function buildOccurrenceDates(rule: OccurrenceRule) {
  const start = parseDate(rule.start);
  const end = parseDate(rule.end);
  if (end < start) throw new Error("Work Scheduler end date must not precede the start date.");
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = mondayIndex(cursor);
    const matches = rule.type === "ONE_TIME"
      ? cursor.getTime() === start.getTime()
      : rule.type === "DAILY"
        ? true
        : rule.type === "WEEKLY"
          ? cursor.getTime() === start.getTime() || (cursor.getTime() > start.getTime() && Math.floor((cursor.getTime() - start.getTime()) / 86400000) % 7 === 0)
          : (rule.weekdays ?? []).includes(day);
    if (matches) dates.push(dateValue(cursor));
    if (rule.type === "ONE_TIME") break;
  }
  return dates;
}

export function rotationEmployeeForOccurrence(members: string[], occurrenceIndex: number) {
  if (!members.length) return null;
  return members[Math.abs(occurrenceIndex) % members.length] ?? null;
}

