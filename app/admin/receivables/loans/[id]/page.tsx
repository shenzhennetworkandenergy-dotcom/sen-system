import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivableOperations } from "@/components/receivables/ReceivableOperations";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getNonSalesReceivableDetail } from "@/lib/receivables/data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";

export const dynamic = "force-dynamic";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-BD", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Dhaka",
    }).format(new Date(value))
  : "Not set";

function metric(labelText: string, value: string, tone = "border-blue-200") {
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelText}</p>
      <strong className="mt-2 block text-xl text-[var(--primary)]">{value}</strong>
    </article>
  );
}

export default async function ReceivableLoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions([
    "receivables.view",
    "receivables.view_loans",
  ]);
  const { id } = await params;
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const detail = await getNonSalesReceivableDetail(id, reportScope);
  if (!detail) notFound();
  const isAdmin = reportScope.isAdmin;
  const canViewCustomer = reportScope.canViewCustomerReceivables;
  const operationPermissions = {
    canCreate: isAdmin || permissions.has("receivables.create"),
    canApprove: isAdmin || permissions.has("receivables.approve"),
    canDisburse: isAdmin || permissions.has("receivables.disburse"),
    canRecordRepayment: isAdmin || permissions.has("receivables.record_repayment"),
    canAdjust: isAdmin || permissions.has("receivables.adjust"),
    canPostAccounting: isAdmin || permissions.has("accounting.create_entry"),
  };
  const operationIds = {
    lifecycle: crypto.randomUUID(),
    schedule: crypto.randomUUID(),
    disbursement: crypto.randomUUID(),
    repayment: crypto.randomUUID(),
    adjustment: crypto.randomUUID(),
    accountingReversal: crypto.randomUUID(),
    reversals: Object.fromEntries(
      detail.transactions.map((transaction) => [transaction.id, crypto.randomUUID()]),
    ),
    accountingReversals: Object.fromEntries(
      detail.accountingPostings.map((posting) => [posting.receivableTransactionId, crypto.randomUUID()]),
    ),
  };
  const approvedExposure = detail.account.existingExposure
    + (detail.account.approvedAmount ?? detail.account.requestedAmount);
  // Pass only the fields the interactive client component needs.  The full
  // server DTO contains borrower/audit metadata that must not be serialized
  // into the browser merely because the component's TypeScript type narrows it.
  const operationAccount = {
    id: detail.account.id,
    status: detail.account.status,
    requestedAmount: detail.account.requestedAmount,
    approvedAmount: detail.account.approvedAmount,
    outstandingAmount: detail.account.outstandingAmount,
    installmentCount: detail.account.installmentCount,
    installmentAmount: detail.account.installmentAmount,
    firstDueDate: detail.account.firstDueDate,
  };

  return (
    <DashboardShell
      admin={isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={detail.account.receivableNumber}
      subtitle={`${label(detail.account.category)} · ${detail.account.borrowerName}`}
    >
      <ReceivablesNavigation
        canViewCustomer={canViewCustomer}
        canViewLoans={reportScope.canViewLoans}
        canReconcile={reportScope.canViewAccountingDetails}
      />
      <Link href="/admin/receivables/loans" className="mb-4 inline-flex font-semibold text-blue-800 hover:underline">
        ← Back to Loans & Advances
      </Link>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metric("Requested", money(detail.account.requestedAmount, detail.account.currency))}
        {metric("Approved", detail.account.approvedAmount == null ? "Not approved" : money(detail.account.approvedAmount, detail.account.currency), "border-violet-200")}
        {metric("Disbursed / Opening", money(detail.account.disbursedAmount + detail.account.openingPrincipal, detail.account.currency), "border-cyan-200")}
        {metric("Recovered / Adjusted", money(detail.account.recoveredAmount, detail.account.currency), "border-green-200")}
        {metric("Current outstanding", money(detail.account.outstandingAmount, detail.account.currency), "border-amber-200")}
      </div>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--primary)]">Account details</h2>
              <p className="text-sm text-slate-500">One independent operational receivable account.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${detail.account.status === "fully_repaid" ? "bg-green-100 text-green-800" : detail.account.status === "rejected" || detail.account.status === "cancelled" ? "bg-slate-200 text-slate-700" : detail.account.status === "under_review" || detail.account.status === "approved" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>
              {label(detail.account.status)}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Borrower", detail.account.borrowerName],
              ["Borrower type", label(detail.account.borrowerType)],
              ["Category", label(detail.account.category)],
              ["Currency", detail.account.currency],
              ["Repayment method", detail.account.defaultRepaymentMethod ? label(detail.account.defaultRepaymentMethod) : "Not set"],
              ["Installments", detail.account.installmentCount ? `${detail.account.installmentCount} × ${money(detail.account.installmentAmount ?? 0, detail.account.currency)}` : "Not scheduled"],
              ["First due", detail.account.firstDueDate ?? "Not set"],
              ["Final due", detail.account.finalDueDate ?? "Not set"],
              ["Approved", dateTime(detail.account.approvedAt)],
              ["Disbursed", detail.account.disbursementDate ?? "Not disbursed"],
              ["Created", dateTime(detail.account.createdAt)],
              ["Opening balance", detail.account.isOpeningBalance ? `As of ${detail.account.openingAsOfDate}` : "No"],
            ].map(([term, description]) => (
              <div key={term} className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</dt>
                <dd className="mt-1 font-medium text-slate-900">{description}</dd>
              </div>
            ))}
          </dl>
          {detail.account.notes ? <p className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm">{detail.account.notes}</p> : null}
        </article>

        <article className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-violet-950">Borrower exposure</h2>
          <p className="mt-1 text-sm text-violet-900">Informational only; no automatic rejection rule is applied.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt>Existing other outstanding</dt><dd className="font-bold">{money(detail.account.existingExposure, detail.account.currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt>This requested / approved account</dt><dd className="font-bold">{money(detail.account.approvedAmount ?? detail.account.requestedAmount, detail.account.currency)}</dd></div>
            <div className="border-t border-violet-200 pt-3 flex justify-between gap-3"><dt>Exposure after approval</dt><dd className="font-bold text-violet-950">{money(approvedExposure, detail.account.currency)}</dd></div>
          </dl>
          <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            Phase 5 accounting posting is available only for authorized BDT transactions. Opening balances remain historical and unposted.
          </p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Installment Schedule</h2>
        {detail.installments.length ? (
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-100"><tr>{["#","Due date","Amount due","Paid / allocated","Remaining","Status"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{detail.installments.map((installment) => <tr key={installment.id} className="border-t"><td className="p-3">{installment.installmentNumber}</td><td className="p-3">{installment.dueDate}</td><td className="p-3">{money(installment.amountDue, detail.account.currency)}</td><td className="p-3 text-green-800">{money(installment.paidAmount, detail.account.currency)}</td><td className="p-3 font-semibold">{money(installment.remainingAmount, detail.account.currency)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${installment.status === "paid" ? "bg-green-100 text-green-800" : installment.status === "overdue" ? "bg-red-100 text-red-800" : installment.status === "partial" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>{label(installment.status)}</span></td></tr>)}</tbody></table></div>
        ) : <p className="mt-2 text-sm text-slate-500">No installment schedule is attached to this account.</p>}
      </section>

      <section className="mt-5">
        <ReceivableOperations
          account={operationAccount}
          permissions={operationPermissions}
          operationIds={operationIds}
          transactions={detail.transactions}
          accountingPostings={detail.accountingPostings}
          canViewAccountingDetails={reportScope.canViewAccountingDetails}
        />
      </section>

      {reportScope.canViewAccountingDetails ? <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-indigo-950">Accounting &amp; Cash Book Reconciliation</h2>
            <p className="mt-1 text-sm text-indigo-900">Every posted movement is linked to one journal and, for cash movements, one Cash Book entry.</p>
          </div>
          <Link href="/admin/receivables/reconciliation" className="font-semibold text-indigo-800 hover:underline">Open reconciliation view →</Link>
        </div>
        {detail.accountingPostings.length ? (
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/80"><tr>{["Date","Movement","Treatment","Posting status","Journal","Cash Book"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{detail.accountingPostings.map((posting) => <tr key={posting.receivableTransactionId} className="border-t border-indigo-100"><td className="p-3">{posting.effectiveDate}</td><td className="p-3">{label(posting.transactionType)} · {posting.direction === "increase" ? "+" : "−"}{money(posting.amount, posting.currency)}</td><td className="p-3">{posting.accountingTreatment ? label(posting.accountingTreatment) : "Not set"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${posting.postingStatus === "posted" ? "bg-green-100 text-green-800" : posting.postingStatus === "needs_review" ? "bg-amber-100 text-amber-900" : posting.postingStatus === "reversed" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-800"}`}>{label(posting.postingStatus)}</span></td><td className="p-3">{posting.journalEntryNumber ?? "—"}</td><td className="p-3">{posting.cashbookEntryId ? "Linked" : "—"}</td></tr>)}</tbody></table></div>
        ) : <p className="mt-4 text-sm text-indigo-900">No accounting posting links exist yet. Opening balances remain intentionally unposted.</p>}
      </section> : (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Accounting &amp; Cash Book Reconciliation</h2>
          <p className="mt-1 text-sm text-slate-600">Accounting and Cash Book details are restricted to users with Accounting visibility.</p>
        </section>
      )}

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Immutable Transaction History</h2>
        {detail.transactions.length ? <div className="mt-3 space-y-2">{detail.transactions.map((transaction) => <article key={transaction.id} className="rounded-xl border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><strong>{label(transaction.transactionType)}</strong><span className={transaction.direction === "increase" ? "font-bold text-blue-800" : "font-bold text-green-800"}>{transaction.direction === "increase" ? "+" : "−"}{money(transaction.amount, detail.account.currency)}</span></div><p className="mt-1 text-slate-500">{transaction.effectiveDate} · {transaction.paymentMethod ? label(transaction.paymentMethod) : "Operational adjustment"} · Operation {transaction.operationId}</p>{transaction.notes ? <p className="mt-1">{transaction.notes}</p> : null}</article>)}</div> : <p className="mt-2 text-sm text-slate-500">No balance movement has been recorded.</p>}
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--primary)]">Audit Activity</h2>
        {detail.audit.length ? <ol className="mt-3 space-y-2">{detail.audit.map((entry) => <li key={entry.id} className="rounded-xl border-l-4 border-blue-300 bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{label(entry.action)}</strong><time>{dateTime(entry.createdAt)}</time></div><p className="mt-1 text-slate-600">{entry.description ?? "Receivable activity recorded."}</p></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No audit activity is available.</p>}
      </section>
    </DashboardShell>
  );
}
