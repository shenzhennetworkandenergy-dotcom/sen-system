"use client";

import { useState } from "react";

import type { EmployeeScheduleRow } from "@/lib/hr/types";

const weekdays = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

function defaultRows(
  startTime: string,
  endTime: string,
  timezone: string,
): EmployeeScheduleRow[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isWorking: weekday >= 1 && weekday <= 5,
    startTime,
    endTime,
    timezone,
  }));
}

export function EmployeeScheduleEditor({
  rows,
  startTime = "09:00",
  endTime = "18:00",
  timezone = "Asia/Dhaka",
}: {
  rows?: EmployeeScheduleRow[] | null;
  startTime?: string;
  endTime?: string;
  timezone?: string;
}) {
  const [schedule, setSchedule] = useState<EmployeeScheduleRow[]>(
    rows?.length === 7 ? rows : defaultRows(startTime, endTime, timezone),
  );
  const update = (weekday: number, changes: Partial<EmployeeScheduleRow>) =>
    setSchedule((current) =>
      current.map((row) => row.weekday === weekday ? { ...row, ...changes } : row),
    );
  const monday = schedule.find((row) => row.weekday === 1)!;

  return (
    <section className="rounded-2xl border bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Weekly work hours</h2>
          <p className="text-sm text-[var(--muted-text)]">
            These hours determine early and late attendance labels.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setSchedule((current) =>
              current.map((row) =>
                row.isWorking
                  ? {
                      ...row,
                      startTime: monday.startTime,
                      endTime: monday.endTime,
                      timezone: monday.timezone,
                    }
                  : row,
              ),
            )
          }
          className="rounded-lg border px-3 py-2 text-sm font-semibold"
        >
          Apply Monday to working days
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[720px] space-y-2">
          {weekdays.map((day) => {
            const row = schedule.find((item) => item.weekday === day.value)!;
            return (
              <div
                key={day.value}
                className="grid grid-cols-[8rem_7rem_1fr_1fr_1.5fr] items-center gap-3 rounded-xl bg-[var(--muted-surface)] p-3"
              >
                <strong>{day.label}</strong>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`schedule_${day.value}_working`}
                    checked={row.isWorking}
                    onChange={(event) => update(day.value, { isWorking: event.target.checked })}
                  />
                  Working
                </label>
                <label className="text-xs font-semibold">
                  Start
                  <input
                    type="time"
                    name={`schedule_${day.value}_start`}
                    value={row.startTime}
                    onChange={(event) => update(day.value, { startTime: event.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border bg-white px-2 py-2"
                  />
                </label>
                <label className="text-xs font-semibold">
                  End
                  <input
                    type="time"
                    name={`schedule_${day.value}_end`}
                    value={row.endTime}
                    onChange={(event) => update(day.value, { endTime: event.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border bg-white px-2 py-2"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Timezone
                  <input
                    name={`schedule_${day.value}_timezone`}
                    value={row.timezone}
                    onChange={(event) => update(day.value, { timezone: event.target.value })}
                    required
                    list="sen-timezone-suggestions"
                    className="mt-1 w-full rounded-lg border bg-white px-2 py-2"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
      <datalist id="sen-timezone-suggestions">
        {["Asia/Dhaka","Asia/Shanghai","Asia/Hong_Kong","Asia/Dubai","Europe/London","America/New_York","America/Los_Angeles","UTC"].map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </section>
  );
}

