import { connection } from "next/server";
import Link from "next/link";
import { PayrollDraftForm } from "@/components/hr/PayrollDraftForm";
import { HrPage, hrCard, hrPrimary, hrSecondary, relation } from "@/components/hr/HrPage";
import { requireHrAdmin } from "@/lib/hr/admin";
import { getHrEmployeeOptions, getHrPayroll } from "@/lib/hr/operational";
import { updatePayrollStatusAction } from "../hr-actions";

export const dynamic = "force-dynamic";

type Component = { id: string; name: string; amount: number };
type Deduction = {
  id: string; payroll_component_id: string | null; installment_number: number | null; installment_due_date: string | null;
  original_installment_amount: number | null; planned_deduction_amount: number;
  outstanding_at_plan: number | null; status: string;
  receivable_accounts: { receivable_number: string } | { receivable_number: string }[] | null;
};

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  await requireHrAdmin();
  const [rows, employees, params] = await Promise.all([getHrPayroll(), getHrEmployeeOptions(), searchParams]);
  return <HrPage title="Payroll" subtitle="Prepare, approve and mark employee payroll records as paid." success={params.success} error={params.error}>
    <PayrollDraftForm employees={employees}/>
    <section className="mt-5 space-y-3">{rows.map(row => {
      const employee = relation(row.hr_employee_records); const person = employee ? relation(employee.profiles) : null;
      const components = (Array.isArray(row.hr_payroll_components) ? row.hr_payroll_components : []) as Component[];
      const deductions = (Array.isArray(row.payroll_receivable_deductions) ? row.payroll_receivable_deductions : []) as Deduction[];
      const automaticComponents = new Set(deductions.map(d => d.payroll_component_id));
      const amount = (name: string) => String(components.filter(c => c.name === name && !automaticComponents.has(c.id)).reduce((sum, c) => sum + Number(c.amount), 0));
      return <article key={row.id} className={hrCard}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><strong>{person?.full_name || employee?.employee_number}</strong>
            <p className="text-sm text-[var(--muted-text)]">{row.period_start} to {row.period_end} · Gross {row.currency} {row.gross_pay} · Total deduction {row.currency} {row.deductions} · Net {row.currency} {row.net_pay}</p>
            <p className="mt-1 text-sm">Payment effective date: <strong>{row.payment_effective_date || "Not recorded (historical / manual review required)"}</strong></p>
            {row.paid_at ? <p className="text-xs text-[var(--muted-text)]">Actual payment posting: {row.paid_at}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2"><span className="capitalize">{row.status}</span>
            <Link href={`/admin/hr/payroll/${row.id}/voucher`} className={hrSecondary}>Print Payroll Voucher</Link>
            {row.status === "draft" ? <form action={updatePayrollStatusAction} className="space-y-2 rounded-lg border p-2">
              <input type="hidden" name="payroll_id" value={row.id}/><input type="hidden" name="payment_effective_date" value={row.payment_effective_date || ""}/><input type="hidden" name="expected_updated_at" value={row.updated_at}/>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="effective_date_confirmed" required disabled={!row.payment_effective_date}/>I confirm effective date {row.payment_effective_date || "(recalculate first)"}</label>
              <button name="status" value="approved" disabled={!row.payment_effective_date} className={hrPrimary}>Approve</button>
            </form> : null}
            {row.status === "approved" ? <form action={updatePayrollStatusAction}><input type="hidden" name="payroll_id" value={row.id}/><button name="status" value="paid" className={hrPrimary}>Mark paid</button></form> : null}
            {!["paid", "cancelled"].includes(row.status) ? <form action={updatePayrollStatusAction}><input type="hidden" name="payroll_id" value={row.id}/><button name="status" value="cancelled" className={hrSecondary}>Cancel payroll</button></form> : null}
          </div>
        </div>
        {deductions.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="py-2 text-left font-semibold">Loan / advance installment snapshot (balance moves only at Paid)</caption><thead><tr>{["Reference", "Sequence", "Due date", "Original amount", "Scheduled deduction", "Outstanding at planning", "Reservation"].map(label => <th className="border-b p-2" key={label}>{label}</th>)}</tr></thead><tbody>{deductions.map(d => <tr key={d.id}><td className="p-2">{relation(d.receivable_accounts)?.receivable_number}</td><td className="p-2">{d.installment_number ?? "Legacy — review"}</td><td className="p-2">{d.installment_due_date ?? "Not recorded"}</td><td className="p-2">{d.original_installment_amount ?? "Not recorded"}</td><td className="p-2 font-semibold">{row.currency} {d.planned_deduction_amount}</td><td className="p-2">{d.outstanding_at_plan ?? "Not recorded"}</td><td className="p-2">{d.status}</td></tr>)}</tbody></table></div> : null}
        {row.status === "draft" ? <details className="mt-4"><summary className="cursor-pointer font-semibold">Edit draft / re-confirm payment date</summary><div className="mt-3"><PayrollDraftForm employees={employees} initial={{ id: row.id, employeeId: row.employee_record_id, start: row.period_start, end: row.period_end, effective: row.payment_effective_date || "", base: String(row.base_salary), allowance: amount("Allowance"), bonus: amount("Bonus"), manual: amount("Deduction"), currency: row.currency, notes: row.notes || "", updatedAt: row.updated_at }}/></div></details> : null}
      </article>;
    })}{!rows.length ? <p className={hrCard}>No payroll records yet.</p> : null}</section>
  </HrPage>;
}
