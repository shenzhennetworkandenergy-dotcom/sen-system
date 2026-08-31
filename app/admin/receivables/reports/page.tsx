import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requirePermission } from "@/lib/auth/permissions";
import { getReceivablesManagementSummary } from "@/lib/receivables/reports-data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";
import { routes } from "@/lib/constants/routes";

export const dynamic = "force-dynamic";

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

export default async function ReceivablesReportsPage() {
  await connection();
  const { profile, permissions } = await requirePermission("receivables.view");
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const summaries = await getReceivablesManagementSummary(reportScope);

  const reportLinks = [
    {
      key: "customer-outstanding",
      label: "Customer outstanding",
      description: "Invoice balances, payment status, due dates and aging by authorized Sales scope.",
      href: routes.adminReceivableCustomerReports,
      visible: reportScope.canViewCustomerReceivables,
    },
    {
      key: "customer-due",
      label: "Customer due / overdue",
      description: "Due today, due soon and overdue Sales-derived balances with Dhaka-date filters.",
      href: `${routes.adminReceivableCustomerReports}?dueStatus=overdue`,
      visible: reportScope.canViewCustomerReceivables,
    },
    {
      key: "customer-aging",
      label: "Customer aging",
      description: "Currency-separated aging buckets without aging records that have no genuine due date.",
      href: `${routes.adminReceivableCustomerReports}#aging-summary`,
      visible: reportScope.canViewCustomerReceivables,
    },
    {
      key: "customer-statements",
      label: "Customer Sales statements",
      description: "Open an authorized customer row to inspect its Sales-only invoice and payment statement.",
      href: `${routes.adminReceivableCustomerReports}#customer-statement-links`,
      visible: reportScope.canViewCustomerReceivables,
    },
    {
      key: "non-sales-statements",
      label: "Loan / advance statements",
      description: "Inspect an authorized Non-Sales account's opening, disbursement, repayment and reversal history.",
      href: `${routes.adminReceivableNonSalesReports}#non-sales-statement-links`,
      visible: reportScope.canViewLoans,
    },
    {
      key: "non-sales-accounts",
      label: "Non-Sales accounts",
      description: "Loans, advances and deposits with their immutable operational history.",
      href: routes.adminReceivableNonSalesReports,
      visible: reportScope.canViewLoans,
    },
    {
      key: "installments",
      label: "Installments",
      description: "FIFO-derived installment status, due dates and remaining amounts.",
      href: routes.adminReceivableInstallmentReports,
      visible: reportScope.canViewLoans,
    },
    {
      key: "activity",
      label: "Collections & activity",
      description: "Read-only customer collections, repayments, adjustments and reversals.",
      href: routes.adminReceivableActivityReports,
      visible: reportScope.canViewCustomerReceivables || reportScope.canViewLoans,
    },
    {
      key: "reconciliation",
      label: "Accounting reconciliation",
      description: "Posting status and journal/Cash Book links for authorized accounting viewers.",
      href: routes.adminReceivablesReconciliation,
      visible: reportScope.canViewAccountingDetails,
    },
  ].filter((item) => item.visible);

  return (
    <DashboardShell
      admin={reportScope.isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Receivables Reports"
      subtitle="Bounded, read-only reporting scoped to your authorized Receivables and Sales visibility."
    >
      <ReceivablesNavigation
        canViewCustomer={reportScope.canViewCustomerReceivables}
        canViewLoans={reportScope.canViewLoans}
        canReconcile={reportScope.canViewAccountingDetails}
        canViewReports
      />

      <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">One source of truth</p>
        <p className="mt-1">Customer balances remain derived from Sales and successful payments. Non-Sales balances remain derived from immutable Receivable transactions. Reports never create or change financial records.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportLinks.map((item) => (
          <a key={item.key} href={item.href} className="group rounded-2xl border bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-[var(--primary)]">{item.label}</h2>
              <span aria-hidden className="text-lg text-blue-700 transition group-hover:translate-x-1">→</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted-text)]">{item.description}</p>
          </a>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[var(--primary)]">Authorized exposure summary</h2>
            <p className="text-sm text-[var(--muted-text)]">Totals stay separated by currency and only include sources this account can view.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Read only</span>
        </div>
        {summaries.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summaries.map((summary) => (
              <article key={summary.currency} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">{summary.currency}</h3><span className="text-xs text-slate-500">currency group</span></div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-slate-500">Customer outstanding</dt><dd className="mt-0.5 font-bold text-blue-900">{money(summary.customerOutstanding, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Current + due soon</dt><dd className="mt-0.5 font-semibold text-blue-800">{money(summary.currentOutstanding, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Non-Sales outstanding</dt><dd className="mt-0.5 font-bold text-violet-900">{money(summary.nonSalesOutstanding, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Due today</dt><dd className="mt-0.5 font-semibold text-amber-800">{money(summary.dueToday, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Due next 7 days</dt><dd className="mt-0.5 font-semibold text-amber-800">{money(summary.dueNext7Days, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Overdue</dt><dd className="mt-0.5 font-semibold text-red-700">{money(summary.overdue, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">No due date</dt><dd className="mt-0.5 font-semibold text-slate-700">{money(summary.noDueDate, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Collected / recovered this month</dt><dd className="mt-0.5 font-semibold text-green-800">{money(summary.collectionsThisMonth + summary.repaymentsThisMonth, summary.currency)}</dd></div>
                  <div><dt className="text-slate-500">Active loan accounts</dt><dd className="mt-0.5 font-semibold text-blue-800">{summary.activeLoans}</dd></div>
                  <div><dt className="text-slate-500">Fully repaid accounts</dt><dd className="mt-0.5 font-semibold text-green-800">{summary.fullyRepaid}</dd></div>
                  {summary.needsReview != null ? <div><dt className="text-slate-500">Needs review</dt><dd className="mt-0.5 font-semibold text-amber-800">{summary.needsReview}</dd></div> : null}
                  {summary.notPosted != null ? <div><dt className="text-slate-500">Not posted</dt><dd className="mt-0.5 font-semibold text-slate-700">{summary.notPosted}</dd></div> : null}
                </dl>
                {summary.statusCountsTruncated || summary.reconciliationTruncated ? <p className="mt-2 text-xs text-amber-800">Some management counts are bounded; refine the underlying report for a complete result.</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No authorized reporting data is available.</p>
        )}
      </section>

      {reportLinks.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">No report category has been assigned to this account.</p>
      ) : null}
      <p className="mt-4 text-xs text-slate-500">Values are presentation summaries only; Accounting remains the authoritative financial ledger.</p>
    </DashboardShell>
  );
}
