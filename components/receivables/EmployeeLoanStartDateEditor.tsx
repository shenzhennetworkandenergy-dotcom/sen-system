"use client";

import { useActionState, useState } from "react";
import { editEmployeeLoanStartDateAction } from "@/app/admin/receivables/employee-loan-actions";
import type { EmployeeLoanStartDateState } from "@/lib/receivables/employee-loan-start-date";

const initialState: EmployeeLoanStartDateState = { status: "idle", message: "" };

export function EmployeeLoanStartDateEditor({ accountId, currentDate, approvedDate, repaymentMethod, version, eligible }: {
  accountId: string; currentDate: string; approvedDate: string | null; repaymentMethod: string | null; version: number; eligible: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(editEmployeeLoanStartDateAction, initialState);
  return <section aria-label="Preferred start date amendment" className="rounded-xl border border-blue-200 bg-white p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold text-blue-950">Preferred start: {currentDate}</h3>{approvedDate ? <p className="mt-1 text-slate-600">Effective approved deduction start: {approvedDate}</p> : null}</div>
      {!editing && eligible ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-blue-300 px-3 py-2 font-semibold text-blue-900 hover:bg-blue-50">Edit Preferred Start</button> : null}
    </div>
    <p className="mt-2 text-slate-600">Only unsigned, undisbursed applications can be amended. Repayments, processed payroll and accounting history are never rewritten.</p>
    {repaymentMethod !== "salary_deduction" ? <p className="mt-2 text-amber-900">Salary deduction is not configured on this loan. Editing the date does not change its repayment method or make it payroll-eligible.</p> : null}
    {!eligible ? <p className="mt-2 font-medium text-amber-900">This loan is locked by its signed agreement, disbursement or final status.</p> : null}
    {state.message ? <p role="status" aria-live="polite" className={`mt-3 rounded-lg border p-3 ${state.status === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>{state.message}</p> : null}
    {editing && eligible ? <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="expected_version" value={version} />
      <label className="block max-w-sm font-semibold">New preferred / effective deduction start<input key={currentDate} type="date" name="start_date" defaultValue={currentDate} required disabled={pending} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" /></label>
      <label className="flex items-start gap-2"><input type="checkbox" name="confirmed" required disabled={pending} className="mt-1" /><span>I confirm this date-only amendment. Future eligible installments will use the new date; any agreement should be reviewed again before signing.</span></label>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={pending} className="rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save Start Date"}</button><button type="button" disabled={pending} onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">Cancel</button></div>
    </form> : null}
  </section>;
}
