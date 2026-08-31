import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getInstallmentReport } from "@/lib/receivables/reports-data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";
import { routes } from "@/lib/constants/routes";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};
function inputFromSearchParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value ?? ""]));
}

export default async function ReceivableInstallmentReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const rawParams = await searchParams;
  const data = await getInstallmentReport(inputFromSearchParams(rawParams), reportScope);
  const filters = data.filters;
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (filters.search) query.set("q", filters.search);
    if (filters.currency) query.set("currency", filters.currency);
    if (filters.category) query.set("category", filters.category);
    if (filters.borrower) query.set("borrower", filters.borrower);
    if (filters.status) query.set("status", filters.status);
    if (filters.dueStatus) query.set("dueStatus", filters.dueStatus);
    if (filters.dueFrom) query.set("dueFrom", filters.dueFrom);
    if (filters.dueTo) query.set("dueTo", filters.dueTo);
    query.set("page", String(page));
    return `${routes.adminReceivableInstallmentReports}?${query.toString()}`;
  };
  const statusTone = (status: string) => status === "paid" ? "bg-green-100 text-green-800" : status === "overdue" ? "bg-red-100 text-red-800" : status === "due_today" ? "bg-amber-100 text-amber-900" : status === "partial" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700";

  return (
    <DashboardShell admin={reportScope.isAdmin} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Installment Report" subtitle="FIFO-derived installment status for authorized Non-Sales Receivable accounts.">
      <ReceivablesNavigation canViewCustomer={reportScope.canViewCustomerReceivables} canViewLoans={reportScope.canViewLoans} canReconcile={reportScope.canViewAccountingDetails} canViewReports />
      {data.totalsTruncated ? <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Schedule totals are shown for the bounded result set. Refine filters for a complete account-level view.</p> : null}
      {data.unsupportedFilters.length ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Some supplied filters are not applicable to the installment report: {data.unsupportedFilters.join(", ")}.</p> : null}
      {data.totals.length ? <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.totals.map((summary) => <article key={summary.currency} className="rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{summary.currency} schedule</p><dl className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-violet-700">Scheduled</dt><dd className="font-bold">{money(summary.scheduled, summary.currency)}</dd></div><div><dt className="text-violet-700">Paid</dt><dd className="font-bold text-green-800">{money(summary.paid, summary.currency)}</dd></div><div><dt className="text-violet-700">Remaining</dt><dd className="font-bold text-violet-950">{money(summary.remaining, summary.currency)}</dd></div></dl></article>)}</section> : null}
      <form className="mb-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-6"><input name="q" defaultValue={filters.search} placeholder="Receivable number or borrower" maxLength={80} className="rounded-xl border px-3 py-2 xl:col-span-2" /><input name="borrower" defaultValue={filters.borrower} placeholder="Borrower" maxLength={80} className="rounded-xl border px-3 py-2" /><input name="category" defaultValue={filters.category} placeholder="Category" maxLength={60} className="rounded-xl border px-3 py-2" /><input name="currency" defaultValue={filters.currency} placeholder="Currency" maxLength={3} className="rounded-xl border px-3 py-2 uppercase" /><select name="dueStatus" defaultValue={filters.dueStatus} className="rounded-xl border px-3 py-2"><option value="">All due states</option><option value="due_today">Due today</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select><label className="grid gap-1 text-xs font-semibold text-slate-600">Due from<input type="date" name="dueFrom" defaultValue={filters.dueFrom ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Due to<input type="date" name="dueTo" defaultValue={filters.dueTo ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label><button className="rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Apply filters</button></form>
      <section className="overflow-x-auto rounded-2xl border bg-white p-4 shadow-sm"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Receivable", "Borrower", "Category", "#", "Due date", "Amount due", "Paid", "Remaining", "Status", "Days overdue"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3"><a href={`/admin/receivables/reports/non-sales/${row.accountId}`} className="font-semibold text-blue-800 hover:underline">{row.receivableNumber}</a></td><td className="p-3">{row.borrowerName}</td><td className="p-3">{label(row.category)}</td><td className="p-3">{row.installmentNumber}</td><td className="p-3">{row.dueDate}</td><td className="p-3">{money(row.amountDue, row.currency)}</td><td className="p-3 text-green-800">{money(row.paidAmount, row.currency)}</td><td className="p-3 font-bold text-[var(--primary)]">{money(row.remainingAmount, row.currency)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{label(row.status)}</span></td><td className="p-3">{row.daysOverdue ?? "—"}</td></tr>)}</tbody></table>{!data.rows.length ? <p className="p-8 text-center text-sm text-slate-500">No authorized installments match these filters.</p> : null}</section>
      <div className="mt-3 flex items-center justify-between text-sm"><span>{data.count} installment(s){data.truncated ? " · bounded report sample" : ""}</span><div className="flex gap-2">{data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
    </DashboardShell>
  );
}
