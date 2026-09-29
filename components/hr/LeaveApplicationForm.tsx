"use client";

import { useState } from "react";
import { requestLeaveAction } from "@/app/employee/hr/actions";
import { calculateLeaveDays } from "@/lib/hr/leave";

type LeaveType = { id: string; code: string; name: string };
type EmployeeIdentity = { name: string; number: string; designation: string; department: string };

const field = "mt-1 w-full rounded-lg border bg-white px-3 py-2.5 font-normal";

export function LeaveApplicationForm({ employee, leaveTypes }: { employee: EmployeeIdentity; leaveTypes: LeaveType[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const totalDays = calculateLeaveDays(from, to);

  return <form action={requestLeaveAction} className="mx-auto max-w-4xl rounded-2xl border bg-[var(--surface)] p-5 shadow-sm sm:p-7">
    <input type="hidden" name="return_to" value="/employee/hr/leaves/new" />
    <section className="grid gap-4 rounded-xl bg-[var(--muted-surface)] p-4 sm:grid-cols-2">
      <ReadOnly label="Employee Name" value={employee.name}/>
      <ReadOnly label="Employee ID" value={employee.number}/>
      <ReadOnly label="Designation" value={employee.designation}/>
      <ReadOnly label="Department" value={employee.department}/>
    </section>
    <section className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="font-semibold">Leave Type<select className={field} name="leave_type_id" required><option value="">Select leave type</option>{leaveTypes.map((type)=><option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
      <label className="font-semibold">Total Days<input className={`${field} bg-slate-50 font-semibold`} value={totalDays || ""} placeholder="Calculated from dates" readOnly aria-live="polite"/></label>
      <label className="font-semibold">Leave From<input className={field} type="date" name="start_date" value={from} onChange={(event)=>setFrom(event.target.value)} required/></label>
      <label className="font-semibold">Leave To<input className={field} type="date" name="end_date" value={to} min={from || undefined} onChange={(event)=>setTo(event.target.value)} required/></label>
      <label className="font-semibold sm:col-span-2">Reason for Leave<textarea className={`${field} min-h-28`} name="reason" required minLength={3} maxLength={1000}/></label>
      <label className="font-semibold">Contact Number During Leave<input className={field} name="contact_number" type="tel" required maxLength={50}/></label>
      <label className="font-semibold">Location/Address During Leave <span className="font-normal text-[var(--muted-text)]">(optional)</span><input className={field} name="leave_location" maxLength={500}/></label>
      <label className="font-semibold sm:col-span-2">Additional Note <span className="font-normal text-[var(--muted-text)]">(optional)</span><textarea className={`${field} min-h-20`} name="additional_note" maxLength={1000}/></label>
    </section>
    <button className="mt-6 rounded-lg bg-[var(--primary)] px-5 py-2.5 font-semibold text-[var(--primary-foreground)]">Generate Leave Application</button>
  </form>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted-text)]">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

