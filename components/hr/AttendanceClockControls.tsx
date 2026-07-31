"use client";

import { useEffect, useState } from "react";

import { recordSelfAttendanceAction } from "@/app/employee/hr/actions";
import type { SelfAttendanceState } from "@/lib/hr/self-attendance";

type Props = {
  state: SelfAttendanceState;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkIn: string | null;
  checkOut: string | null;
  recordedTimezone: string | null;
};

const stateLabels: Record<SelfAttendanceState, string> = {
  not_checked_in: "Not checked in",
  checked_in: "Currently checked in",
  checked_out: "Attendance completed",
};

export function AttendanceClockControls({
  state,
  canCheckIn,
  canCheckOut,
  checkIn,
  checkOut,
  recordedTimezone,
}: Props) {
  const [timezone, setTimezone] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    let clockTimer: number | undefined;
    const detectionTimer = window.setTimeout(() => {
      const detectedTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka";
      setTimezone(detectedTimezone);
      const refreshClock = () => {
        setCurrentTime(
          new Intl.DateTimeFormat("en-BD", {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: detectedTimezone,
          }).format(new Date()),
        );
      };
      refreshClock();
      clockTimer = window.setInterval(refreshClock, 1_000);
    }, 0);
    return () => {
      window.clearTimeout(detectionTimer);
      if (clockTimer !== undefined) window.clearInterval(clockTimer);
    };
  }, []);

  const recordedTime = (value: string | null) =>
    value && recordedTimezone
      ? new Intl.DateTimeFormat("en-BD", {
          timeStyle: "medium",
          timeZone: recordedTimezone,
        }).format(new Date(value))
      : null;

  return (
    <section className="mb-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
            Today&apos;s attendance
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {stateLabels[state]}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {currentTime || "Detecting your time and timezone…"}
            {timezone ? ` · ${timezone}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The official check time is recorded securely by the server.
            {checkIn ? ` Check in: ${recordedTime(checkIn)}.` : ""}
            {checkOut ? ` Check out: ${recordedTime(checkOut)}.` : ""}
          </p>
        </div>
        <form action={recordSelfAttendanceAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="timezone" value={timezone} />
          <input type="hidden" name="return_to" value="/employee/hr/attendance" />
          {canCheckIn ? (
            <button
              name="event_type"
              value="check_in"
              disabled={!timezone}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              Check in
            </button>
          ) : null}
          {canCheckOut ? (
            <button
              name="event_type"
              value="check_out"
              disabled={!timezone}
              className="rounded-xl bg-rose-600 px-5 py-3 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
            >
              Check out
            </button>
          ) : null}
          {!canCheckIn && !canCheckOut ? (
            <span className="rounded-xl border border-emerald-300 bg-white px-5 py-3 font-semibold text-emerald-800">
              Completed for today
            </span>
          ) : null}
        </form>
      </div>
    </section>
  );
}
