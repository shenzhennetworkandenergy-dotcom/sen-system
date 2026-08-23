"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { recordSelfAttendanceAction } from "@/app/employee/hr/actions";
import { getAttendanceClockPresentation } from "@/components/hr/attendance-clock-presentation";
import type { SelfAttendanceState } from "@/lib/hr/self-attendance";

type Props = {
  state: SelfAttendanceState;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkIn: string | null;
  checkOut: string | null;
  recordedTimezone: string | null;
};

const toneClasses = {
  pending: {
    card: "border-blue-100",
    icon: "bg-blue-50 text-blue-600 ring-blue-100",
    dot: "bg-blue-500",
    status: "text-slate-500",
  },
  active: {
    card: "border-cyan-100",
    icon: "bg-cyan-50 text-cyan-600 ring-cyan-100",
    dot: "bg-emerald-500",
    status: "text-emerald-700",
  },
  complete: {
    card: "border-emerald-100",
    icon: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    dot: "bg-emerald-500",
    status: "text-emerald-700",
  },
} as const;

function FingerprintIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.4 10.8a7.6 7.6 0 0 1 15.2 0" />
      <path d="M6.8 11a5.2 5.2 0 0 1 10.4 0c0 4.4-1.6 7.8-4.1 10" />
      <path d="M9.2 11.1a2.8 2.8 0 0 1 5.6 0c0 3.3-.9 6.4-2.8 8.9" />
      <path d="M12 10.9c0 3.4-.6 6.5-2.7 8.7" />
      <path d="M4.7 14.2c-.1 2.3-.7 4.2-1.7 5.8" />
      <path d="M7 14.1c-.1 3.1-.9 5.7-2.3 7.2" />
      <path d="M19.4 13.7c-.1 3.4-1 6.2-2.5 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function AttendanceActionButton({
  label,
  value,
  timezoneReady,
}: {
  label: "CHECK IN NOW" | "CHECK OUT NOW";
  value: "check_in" | "check_out";
  timezoneReady: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="event_type"
      value={value}
      disabled={!timezoneReady || pending}
      className="group flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-blue-600 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-extrabold tracking-[0.04em] text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(37,99,235,0.34)] active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
    >
      <FingerprintIcon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none" />
      <span>{pending ? "RECORDING…" : label}</span>
    </button>
  );
}

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

  const checkInTime = recordedTime(checkIn);
  const checkOutTime = recordedTime(checkOut);
  const presentation = getAttendanceClockPresentation(
    state,
    checkInTime,
    checkOutTime,
  );
  const tone = toneClasses[presentation.tone];
  const actionAllowed =
    (presentation.actionValue === "check_in" && canCheckIn) ||
    (presentation.actionValue === "check_out" && canCheckOut);

  return (
    <section className="relative mb-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,35,67,0.08)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-100/45 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-blue-100/40 blur-3xl"
      />

      <div className="relative grid items-center gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,360px)] lg:gap-8 lg:p-6">
        <div className="min-w-0 py-1 sm:py-2">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-700">
            Today&apos;s attendance
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900 sm:text-2xl">
            Your workday clock
          </h2>
          <p className="mt-2 break-words text-sm font-medium text-slate-600 sm:text-base">
            {currentTime || "Detecting your time and timezone…"}
            {timezone ? ` · ${timezone}` : ""}
          </p>
          <div className="mt-4 flex max-w-2xl items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-3.5 py-3 text-xs leading-5 text-slate-600 sm:text-sm">
            <svg
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>
              The official check time is recorded securely by the server using
              your detected timezone.
            </span>
          </div>
        </div>

        <div
          className={`mx-auto w-full max-w-[360px] rounded-[1.65rem] border bg-white/95 p-4 shadow-[0_16px_36px_rgba(30,64,175,0.12)] backdrop-blur-sm sm:p-5 lg:mx-0 lg:justify-self-end ${tone.card}`}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className={`grid h-20 w-20 place-items-center rounded-full ring-8 sm:h-24 sm:w-24 ${tone.icon}`}
            >
              <FingerprintIcon className="h-11 w-11 sm:h-13 sm:w-13" />
            </div>
            <p className="mt-4 text-sm font-extrabold tracking-[0.02em] text-slate-900 sm:text-base">
              Attendance
            </p>
            <span
              aria-hidden="true"
              className="mt-2 h-0.5 w-6 rounded-full bg-blue-500"
            />
          </div>

          <form
            action={recordSelfAttendanceAction}
            className="mt-4 flex flex-col items-center"
          >
            <input type="hidden" name="timezone" value={timezone} />
            <input
              type="hidden"
              name="return_to"
              value="/employee/hr/attendance"
            />

            {presentation.actionLabel &&
            presentation.actionValue &&
            actionAllowed ? (
              <AttendanceActionButton
                label={presentation.actionLabel}
                value={presentation.actionValue}
                timezoneReady={Boolean(timezone)}
              />
            ) : (
              <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-extrabold tracking-[0.02em] text-emerald-700">
                <CheckIcon />
                Attendance Completed
              </div>
            )}

            <div
              aria-live="polite"
              className={`mt-4 flex items-center justify-center gap-2 text-xs font-semibold sm:text-sm ${tone.status}`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${tone.dot}`}
              />
              <span>{presentation.statusLabel}</span>
            </div>
            <p className="mt-1 min-h-5 text-center text-xs leading-5 text-slate-500">
              {presentation.statusDetail}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
