import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getNonSalesReceivables } from "@/lib/receivables/data";
import { getReceivablesManagementSummary } from "@/lib/receivables/reports-data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";
import { routes } from "@/lib/constants/routes";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

export default async function NonSalesReceivablesReportPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const params = await searchParams;
  const [data, summaries] = await Promise.all([
    getNonSalesReceivables(params, reportScope),
    getReceivablesManagementSummary(reportScope),
  ]);
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (data.search) query.set("q", data.search);
    if (data.filters.category) query.set("category", data.filters.category);
    if (data.filters.status) query.set("status", data.filters.status);
    if (data.filters.borrowerType) query.set("borrowerType", data.filters.borrowerType);
    if (data.filters.currency) query.set("currency", data.filters.currency);
    if (data.filters.outstandingOnly) query.set("outstandingOnly", "1");
    query.set("page", String(page));
    return `${routes.adminReceivableNonSalesReports}?${query.toString()}`;
  };
  const loanSummaries = summaries.filter((summary) => summary.nonSalesOutstanding > 0 || summary.activeLoans > 0 || summary.fullyRepaid > 0);

  return (
    <DashboardShell
      admin={reportScope.isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Non-Sales Receivables Report"
      subtitle="Loans, advances and deposits from the Phase 3 operational model; balances remain currency-separated and read only."
    >
      <ReceivablesNavigation
        canViewCustomer={reportScope.canViewCustomerReceivables}
        canViewLoans={reportScope.canViewLoans}
        canReconcile={reportScope.canViewAccountingDetails}
        canViewReports
      />
      {data.count > data.page * data.pageSize ? <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">More authorized accounts are available; refine the filters or use the pagination controls.</p> : null}
      {loanSummaries.length ? <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{loanSummaries.map((summary) => <article key={summary.currency} className="rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{summary.currency} non-Sales</p><p className="mt-1 text-lg font-bold text-violet-950">{money(summary.nonSalesOutstanding, summary.currency)}</p><p className="mt-1 text-xs text-violet-900">{summary.activeLoans} active · {summary.fullyRepaid} fully repaid</p><p className="text-xs text-violet-800">Recovered / adjusted this month: {money(summary.repaymentsThisMonth, summary.currency)}</p></article>)}</section> : null}
      <form className="mb-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <input name="q" defaultValue={data.search} placeholder="Borrower or receivable number" maxLength={80} className="rounded-xl border px-3 py-2 xl:col-span-2" />
        <select name="category" defaultValue={data.filters.category} className="rounded-xl border px-3 py-2"><option value="">All categories</option>{["employee_loan", "salary_advance", "customer_loan", "company_loan", "individual_loan", "supplier_refundable_advance", "security_deposit", "rent_advance", "recoverable_advance", "other"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
        <select name="status" defaultValue={data.filters.status} className="rounded-xl border px-3 py-2"><option value="">All statuses</option>{["requested", "under_review", "approved", "active", "fully_repaid", "rejected", "cancelled"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
        <select name="borrowerType" defaultValue={data.filters.borrowerType} className="rounded-xl border px-3 py-2"><option value="">All borrower types</option>{["employee", "customer", "supplier", "crm_company", "crm_contact", "external_party"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
        <input name="currency" defaultValue={data.filters.currency} placeholder="Currency" maxLength={3} className="rounded-xl border px-3 py-2 uppercase" />
        <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" name="outstandingOnly" value="1" defaultChecked={data.filters.outstandingOnly} /> Outstanding</label><button className="ml-auto rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Filter</button></div>
      </form>
      <section id="non-sales-statement-links" className="overflow-x-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Receivable", "Borrower", "Category", "Currency", "Original", "Repaid", "Outstanding", "Lifecycle", "Due", "Source"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.sourceId} className="border-t"><td className="p-3"><a href={`/admin/receivables/reports/non-sales/${row.sourceId}`} className="font-semibold text-blue-800 hover:underline">{row.referenceNumber}</a></td><td className="p-3">{row.partyName}</td><td className="p-3">{label(row.receivableType)}</td><td className="p-3">{row.currency}</td><td className="p-3">{money(row.originalAmount, row.currency)}</td><td className="p-3 text-green-800">{money(row.paidAmount, row.currency)}</td><td className="p-3 font-bold text-[var(--primary)]">{money(row.outstandingAmount, row.currency)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.receivableStatus === "fully_repaid" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{label(row.receivableStatus)}</span></td><td className="p-3">{row.dueDate ?? "Not set"}{row.daysOverdue != null ? <p className="text-xs text-red-700">{row.daysOverdue} day(s) overdue</p> : null}</td><td className="p-3">{row.isOpeningBalance ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Opening balance</span> : "Operational account"}</td></tr>)}</tbody></table>{!data.rows.length ? <p className="p-8 text-center text-sm text-slate-500">No authorized non-Sales receivables match these filters.</p> : null}</section>
      <div className="mt-3 flex items-center justify-between text-sm"><span>{data.count} account(s)</span><div className="flex gap-2">{data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
    </DashboardShell>
  );
}
