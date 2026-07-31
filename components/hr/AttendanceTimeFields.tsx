"use client";

import { useEffect, useState } from "react";

const localDateTime = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function AttendanceTimeFields({ defaultWorkDate, fieldClass }: { defaultWorkDate: string; fieldClass: string }) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [workDate, setWorkDate] = useState(defaultWorkDate);
  const [timezone, setTimezone] = useState("Asia/Dhaka");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = localDateTime();
      setCheckIn(now);
      setWorkDate(now.slice(0, 10));
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <input type="hidden" name="attendance_timezone" value={timezone}/>
      <label className="mt-3 block text-sm font-semibold">Work date<input type="date" name="work_date" required value={workDate} onChange={(event) => setWorkDate(event.target.value)} className={fieldClass}/></label>
      <p className="mt-2 text-xs text-[var(--muted-text)]">Times default from this device. Recorded timezone: {timezone}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">Check in<input type="datetime-local" name="check_in" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={fieldClass}/><button type="button" onClick={() => setCheckIn(localDateTime())} className="mt-1 text-xs font-semibold text-blue-700">Use current time</button></label>
        <label className="text-sm font-semibold">Check out<input type="datetime-local" name="check_out" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={fieldClass}/><button type="button" onClick={() => setCheckOut(localDateTime())} className="mt-1 text-xs font-semibold text-blue-700">Use current time</button></label>
      </div>
    </>
  );
}
