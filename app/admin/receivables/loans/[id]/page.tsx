import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { EmployeeLoanAdminPanel } from "@/components/receivables/EmployeeLoanAdminPanel";
import { recordEmployeeLoanRepaymentAction } from "@/app/admin/receivables/employee-loan-actions";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getAdminEmployeeLoanDetail } from "@/lib/receivables/employee-loans-data";

export const dynamic = "force-dynamic";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

const label = (value: string | null | undefined) =>
  String(value ?? "submitted").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function EmployeeLoanAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const { id } = await params;
  const detail = await getAdminEmployeeLoanDetail(id);
  if (!detail) notFound();
  const account = detail.account;
  const extension = detail.extension;
  const operationAccount = {
    id: account.id,
    status: account.status,
    requestedAmount: account.requestedAmount,
    approvedAmount: account.approvedAmount,
    currency: account.currency,
    outstandingAmount: account.outstandingAmount,
    installmentCount: account.installmentCount,
    installmentAmount: account.installmentAmount,
    firstDueDate: account.firstDueDate,
    disbursementDate: account.disbursementDate,
    receivableNumber: account.receivableNumber,
  };

  return (
    <DashboardShell
      admin
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={account.receivableNumber}
      subtitle={`Employee Loan · ${account.borrowerName}`}
    >
      <Link href="/admin/receivables/loans" className="mb-4 inline-flex font-semibold text-blue-800 hover:underline">← Back to Employee Loans</Link>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Requested", money(account.requestedAmount, account.currency)],
          ["Approved", account.approvedAmount == null ? "Not approved" : money(account.approvedAmount, account.currency)],
          ["Outstanding", money(account.outstandingAmount, account.currency)],
          ["Status", label(account.status)],
          ["Stage", label(String(extension.detail.workflow_stage))],
        ].map(([term, value]) => <article key={term} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</p><strong className="mt-2 block text-lg text-[var(--primary)]">{value}</strong></article>)}
      </section>
      <section className="mt-5 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Employee Loan Account</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Employee", account.borrowerName],
            ["Currency", account.currency],
            ["Installments", account.installmentCount ? `${account.installmentCount} × ${money(Number(account.installmentAmount ?? 0), account.currency)}` : "Not scheduled"],
            ["First due", account.firstDueDate ?? "Not set"],
            ["Final due", account.finalDueDate ?? "Not set"],
            ["Disbursed", account.disbursementDate ?? "Not disbursed"],
          ].map(([term, value]) => <div key={term} className="rounded-lg bg-slate-50 p-3"><dt className="font-semibold text-slate-500">{term}</dt><dd className="mt-1">{value}</dd></div>)}
        </dl>
      </section>
      <EmployeeLoanAdminPanel
        account={operationAccount}
        extension={extension}
        permissions={{
          canApprove: profile.role === "admin" || permissions.has("receivables.approve"),
          canDisburse: profile.role === "admin" || permissions.has("receivables.disburse"),
        }}
      />
      {(profile.role === "admin" || permissions.has("receivables.record_repayment")) &&
      !["requested", "under_review", "rejected", "cancelled", "fully_repaid"].includes(String(account.status)) ? (
        <section className="mt-5 rounded-xl border border-green-200 bg-green-50/40 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-green-950">Record Employee Loan Repayment</h2>
          <p className="mt-1 text-sm text-green-900">This uses the existing Receivables repayment contract and does not post Accounting or Cash Book entries.</p>
          <form action={recordEmployeeLoanRepaymentAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="account_id" value={account.id} />
            <label>Amount<input className="mt-1 w-full rounded-lg border px-3 py-2" name="amount" type="number" min="0.0001" step="0.0001" required /></label>
            <label>Effective date<input className="mt-1 w-full rounded-lg border px-3 py-2" name="effective_date" type="date" required /></label>
            <label>Payment method<input className="mt-1 w-full rounded-lg border px-3 py-2" name="payment_method" maxLength={80} required /></label>
            <label>Note<input className="mt-1 w-full rounded-lg border px-3 py-2" name="note" maxLength={500} /></label>
            <button className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white md:col-span-2 xl:col-span-4">Record Repayment</button>
          </form>
        </section>
      ) : null}
      <section className="mt-5 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Installment Schedule</h2>
        {detail.installments.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-100"><tr>{["#", "Due date", "Amount", "Paid", "Remaining", "Status"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{detail.installments.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.installment_number}</td><td className="p-3">{item.due_date}</td><td className="p-3">{money(Number(item.amount_due), account.currency)}</td><td className="p-3">{money(Number(item.paid_amount), account.currency)}</td><td className="p-3">{money(Number(item.remaining_amount), account.currency)}</td><td className="p-3">{label(item.status)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-slate-500">No installment schedule is attached.</p>}
      </section>
      <section className="mt-5 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Immutable Transaction History</h2>
        {detail.transactions.length ? <div className="mt-3 space-y-2">{detail.transactions.map((item) => <article key={item.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{label(item.transaction_type)}</strong><span className="font-semibold">{item.direction === "increase" ? "+" : "−"}{money(Number(item.amount), account.currency)}</span></div><p className="mt-1 text-slate-500">{item.effective_date} · {item.payment_method ?? "Operational"}</p>{item.notes ? <p className="mt-1">{item.notes}</p> : null}</article>)}</div> : <p className="mt-2 text-sm text-slate-500">No balance movement has been recorded.</p>}
      </section>
      <section className="mt-5 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Audit Activity</h2>
        {detail.audit.length ? <ol className="mt-3 space-y-2">{detail.audit.map((item) => <li key={item.id} className="rounded-lg border-l-4 border-blue-300 bg-slate-50 p-3 text-sm"><strong>{label(item.action)}</strong><p className="mt-1">{item.description ?? "Employee loan activity recorded."}</p></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No audit activity is available.</p>}
      </section>
    </DashboardShell>
  );
}
