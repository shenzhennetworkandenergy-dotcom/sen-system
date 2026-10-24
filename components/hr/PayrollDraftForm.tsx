"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { EmployeeCombobox } from "./EmployeeCombobox";
import type { EmployeeOption } from "@/lib/hr/form-options";
import type { PayrollAutofill, PayrollDraftValues, PayrollQuote } from "@/lib/hr/payroll-autofill";
import { getPayrollAutofillAction, getPayrollQuoteAction, savePayrollDraftV1 } from "@/app/admin/hr/payroll/payroll-actions";

const hrCard = "rounded-2xl border bg-[var(--surface)] p-5 shadow-sm";
const hrField = "mt-1 w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 font-normal";
const hrPrimary = "rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]";

function SaveButton({ disabled, editing }: { disabled: boolean; editing: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} className={`${hrPrimary} mt-3 disabled:opacity-50`}>
    {pending ? "Saving…" : editing ? "Save & recalculate draft" : "Create draft payroll"}
  </button>;
}

export function PayrollDraftForm({ employees, initial }: { employees: EmployeeOption[]; initial?: PayrollDraftValues }) {
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [start, setStart] = useState(initial?.start ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [base, setBase] = useState(initial?.base ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "");
  const [allowance, setAllowance] = useState(initial?.allowance ?? "0");
  const [bonus, setBonus] = useState(initial?.bonus ?? "0");
  const [manual, setManual] = useState(initial?.manual ?? "0");
  const [effective, setEffective] = useState(initial?.effective ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [context, setContext] = useState<PayrollAutofill | null>(null);
  const [contextError, setContextError] = useState("");
  const [quoteResult, setQuoteResult] = useState<{ key: string; quote?: PayrollQuote; error?: string } | null>(null);
  const selection = useRef(0);

  async function selectEmployee(id: string) {
    const ticket = ++selection.current;
    setEmployeeId(id); setContext(null); setContextError(""); setStart(""); setEnd(""); setBase(""); setCurrency(""); setConfirmed(false);
    if (!id) return;
    try {
      const data = await getPayrollAutofillAction(id);
      if (selection.current !== ticket) return;
      setContext(data); setStart(data.period_start ?? ""); setEnd(data.period_end ?? "");
      setBase(data.base_salary === null ? "" : String(data.base_salary)); setCurrency(data.currency ?? "");
    } catch (error) { if (selection.current === ticket) setContextError(error instanceof Error ? error.message : "Unable to load employee payroll context."); }
  }

  useEffect(() => {
    if (!initial) return;
    let active = true;
    getPayrollAutofillAction(initial.employeeId).then(data => { if (active) setContext(data); })
      .catch(() => { if (active) setContextError("Unable to verify employee enrollment. Refresh before saving."); });
    return () => { active = false; };
  }, [initial]);

  const quoteKey = JSON.stringify([employeeId, effective, currency, base, allowance, bonus, manual, initial?.id]);
  const ready = !!(employeeId && effective && currency && base);
  const quote = quoteResult?.key === quoteKey ? quoteResult.quote : undefined;
  const quoteError = quoteResult?.key === quoteKey ? quoteResult.error : undefined;
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setTimeout(() => {
      getPayrollQuoteAction({ employeeId, effective, currency, base, allowance, bonus, manual, payrollId: initial?.id })
        .then(data => { if (active) setQuoteResult({ key: quoteKey, quote: data }); })
        .catch(error => { if (active) setQuoteResult({ key: quoteKey, error: error instanceof Error ? error.message : "Unable to validate deductions." }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [ready, quoteKey, employeeId, effective, currency, base, allowance, bonus, manual, initial?.id]);

  const format = (value: number) => `${currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const review = !initial && context?.review_reason;
  return <form action={savePayrollDraftV1} className={`${hrCard} relative z-40`}>
    {initial ? <><input type="hidden" name="payroll_id" value={initial.id}/><input type="hidden" name="expected_updated_at" value={initial.updatedAt}/></> : null}
    <h2 className="font-semibold">{initial ? "Edit draft payroll" : "Create payroll record"}</h2>
    <p className="mt-1 text-sm text-[var(--muted-text)]">The confirmed payment effective date controls installment eligibility, independently of the salary period. Draft and Approval only reserve installments; repayment posts atomically at Mark paid.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      <label className="text-sm font-semibold">Employee{initial ? <><input type="hidden" name="employee_record_id" value={employeeId}/><p className={hrField}>{employees.find(e => e.id === employeeId)?.label ?? employeeId}</p></> : <EmployeeCombobox employees={employees} onSelect={selectEmployee} required className={hrField}/>}</label>
      <label className="text-sm font-semibold">Period start<input type="date" name="period_start" value={start} onChange={e => setStart(e.target.value)} required className={hrField}/></label>
      <label className="text-sm font-semibold">Period end<input type="date" name="period_end" value={end} onChange={e => setEnd(e.target.value)} required className={hrField}/></label>
      <label className="text-sm font-semibold">Base salary<input type="number" min="0" step=".01" name="base_salary" value={base} onChange={e => setBase(e.target.value)} required className={hrField}/></label>
      <label className="text-sm font-semibold">Allowance<input type="number" min="0" step=".01" name="allowance" value={allowance} onChange={e => setAllowance(e.target.value)} className={hrField}/></label>
      <label className="text-sm font-semibold">Bonus<input type="number" min="0" step=".01" name="bonus" value={bonus} onChange={e => setBonus(e.target.value)} className={hrField}/></label>
      <label className="text-sm font-semibold">Manual deduction (excludes loans)<input type="number" min="0" step=".01" name="deduction" value={manual} onChange={e => setManual(e.target.value)} className={hrField}/></label>
      <label className="text-sm font-semibold">Enrolled currency<input name="currency" value={currency} readOnly required className={hrField}/></label>
      <label className="text-sm font-semibold">Payment effective date<input type="date" name="payment_effective_date" value={effective} onChange={e => { setEffective(e.target.value); setConfirmed(false); }} required className={hrField}/></label>
      <label className="text-sm font-semibold md:col-span-2">Notes / manual review reason<textarea name="notes" defaultValue={initial?.notes ?? ""} required={Boolean(review || (context && Number(base) !== Number(context.base_salary)))} minLength={review ? 10 : undefined} className={hrField}/></label>
    </div>
    <div aria-live="polite" className="mt-3 space-y-2 text-sm">
      {contextError ? <p role="alert" className="text-red-700">{contextError}</p> : null}
      {context?.salary_review ? <p role="alert" className="text-amber-800">{context.salary_review}</p> : null}
      {review ? <p className="text-amber-800">{review} Enter a reviewed period and explain it in Notes.</p> : null}
      {!effective ? <p>Select and confirm the payment date. No date is assumed.</p> : ready && !quote && !quoteError ? <p>Validating loan plan…</p> : null}
      {quoteError ? <p role="alert" className="text-red-700">{quoteError}</p> : null}
      {quote ? <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="py-2 text-left font-semibold">Automatic loan / advance deductions — effective {quote.effective_date}</caption><thead><tr>{["Reference", "Installment", "Due", "Original", "This payroll", "Outstanding before payment"].map(label => <th key={label} className="border-b p-2">{label}</th>)}</tr></thead><tbody>{quote.installments.map(row => <tr key={row.installment_id}><td className="p-2">{row.reference}<span className="block text-xs">{row.category === "salary_advance" ? "Salary advance" : "Employee loan"}</span></td><td className="p-2">{row.installment_number}</td><td className="p-2">{row.due_date}</td><td className="p-2">{format(row.original_amount)}</td><td className="p-2 font-semibold">{format(row.amount)}</td><td className="p-2">{format(row.outstanding)}</td></tr>)}</tbody></table></div>
        {!quote.installments.length ? <p>No unreserved installment is eligible for this payment date.</p> : null}
        <p className="text-xs">Only disbursed active loans with approved schedules qualify. Installments reserved by another active payroll are excluded. Balance fractions below one cent are never rounded up.</p>
        <dl className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3">{[["Gross salary", quote.gross], ["Automatic deduction", quote.automatic], ["Manual deduction", quote.manual], ["Total deduction", quote.deductions], ["Net salary", quote.net]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd className="font-semibold">{format(Number(value))}</dd></div>)}</dl>
        {quote.net < 0 ? <p role="alert" className="text-red-700">Deductions cannot make net salary negative.</p> : null}
      </> : null}
    </div>
    <label className="mt-4 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" name="effective_date_confirmed" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required disabled={!effective}/><span>I explicitly confirm payment effective date {effective || "(select a date)"}. The salary period is unchanged by this date.</span></label>
    <SaveButton disabled={!confirmed || !quote || quote.net < 0 || !context || context.base_salary === null || !!contextError} editing={!!initial}/>
  </form>;
}
