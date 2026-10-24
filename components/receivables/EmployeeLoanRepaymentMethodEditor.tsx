"use client";

import { useActionState, useState } from "react";
import { editEmployeeLoanRepaymentMethodAction } from "@/app/admin/receivables/employee-loan-actions";
import { REPAYMENT_METHOD_LABELS, repaymentMethodLabel, type RepaymentMethodState } from "@/lib/receivables/employee-loan-repayment-method";

export function EmployeeLoanRepaymentMethodEditor({ accountId, method, version, effectiveDate, operationId }: {
  accountId: string; method: string | null; version: number; effectiveDate: string; operationId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(editEmployeeLoanRepaymentMethodAction, { status: "idle", message: "" } as RepaymentMethodState);
  return <section className="my-4 rounded-2xl border border-blue-200 bg-white p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold text-blue-950">Repayment method: {repaymentMethodLabel(method)}</h2>
      {!editing && <button type="button" className="rounded-lg border border-blue-400 px-3 py-2 font-semibold text-blue-900" onClick={() => setEditing(true)}>Edit Repayment Method</button>}
    </div>
    <p className="mt-2 text-slate-600">Changes apply from the explicitly confirmed Dhaka business date only. Historical repayments, paid payroll and signed agreements are never rewritten. Not set does not forgive or close the loan.</p>
    {editing && <form key={version} action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="operation_id" value={operationId} />
      <input type="hidden" name="expected_version" value={version} />
      <label className="grid gap-1">New repayment method
        <select name="method" defaultValue={method ?? ""} required={false} className="rounded-lg border p-2" disabled={pending}>
          <option value="">Not set</option>
          {Object.entries(REPAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Effective date (Asia/Dhaka)
        <input name="effective_date" type="date" value={effectiveDate} readOnly required className="rounded-lg border bg-slate-50 p-2" />
      </label>
      <label className="grid gap-1 sm:col-span-2">Reason for change
        <textarea name="reason" required minLength={10} maxLength={2000} className="rounded-lg border p-2" disabled={pending} />
      </label>
      <label className="flex items-start gap-2 sm:col-span-2">
        <input type="checkbox" name="confirmed" required disabled={pending} className="mt-1" />
        <span>I confirm effective date {effectiveDate} and that this method is compatible with the agreed repayment terms. This action is not a signature or amendment of a signed agreement. Active payroll must be resolved separately.</span>
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={pending} className="rounded-lg bg-blue-950 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save Repayment Method"}</button>
        <button type="button" disabled={pending} className="rounded-lg border px-4 py-2" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>}
    {state.message && <p role="status" className={`mt-3 ${state.status === "error" ? "text-red-800" : "text-green-800"}`}>{state.message}</p>}
  </section>;
}
