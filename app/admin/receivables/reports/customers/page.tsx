import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getCustomerOutstandingReport } from "@/lib/receivables/reports-data";
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
const statusTone = (status: string) => status === "overdue"
  ? "bg-red-100 text-red-800"
  : status === "due_soon" || status === "due_today"
    ? "bg-amber-100 text-amber-900"
    : status === "paid"
      ? "bg-green-100 text-green-800"
      : status === "no_due_date"
        ? "bg-slate-100 text-slate-700"
        : "bg-blue-100 text-blue-800";

function inputFromSearchParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value ?? ""]));
}

export default async function CustomerReceivablesReportPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_customer"]);
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const rawParams = await searchParams;
  const data = await getCustomerOutstandingReport(inputFromSearchParams(rawParams), reportScope);
  const filters = data.filters;
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (filters.search) query.set("q", filters.search);
    if (filters.currency) query.set("currency", filters.currency);
    if (filters.salesperson) query.set("salesperson", filters.salesperson);
    if (filters.status) query.set("status", filters.status);
    if (filters.dueStatus) query.set("dueStatus", filters.dueStatus);
    if (filters.agingBucket) query.set("agingBucket", filters.agingBucket);
    if (filters.dueFrom) query.set("dueFrom", filters.dueFrom);
    if (filters.dueTo) query.set("dueTo", filters.dueTo);
    if (filters.outstandingOnly) query.set("outstandingOnly", "1");
    query.set("page", String(page));
    return `${routes.adminReceivableCustomerReports}?${query.toString()}`;
  };
  const agingBuckets = data.agingTotals.flatMap((summary) => Object.entries(summary.buckets).map(([bucket, amount]) => ({ ...summary, bucket, amount })));

  return (
    <DashboardShell
      admin={reportScope.isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Customer Outstanding Report"
      subtitle="Sales-derived invoice balances using the same authorized own/all visibility scope as Sales."
    >
      <ReceivablesNavigation
        canViewCustomer={reportScope.canViewCustomerReceivables}
        canViewLoans={reportScope.canViewLoans}
        canReconcile={reportScope.canViewAccountingDetails}
        canViewReports
      />
      {reportScope.salesScope.kind === "none" ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">No Sales view scope is assigned. Customer report rows and aggregates are intentionally empty.</p>
      ) : null}
      {agingBuckets.length ? (
        <section id="aging-summary" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {agingBuckets.slice(0, 12).map((item) => (
            <article key={`${item.currency}-${item.bucket}`} className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.currency} · {label(item.bucket)}</p>
              <p className="mt-1 text-lg font-bold text-[var(--primary)]">{money(item.amount, item.currency)}</p>
            </article>
          ))}
        </section>
      ) : null}
      {data.unsupportedFilters.length ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Some supplied filters are not applicable to this report: {data.unsupportedFilters.join(", ")}.</p> : null}
      {data.summaryTruncated ? <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Aging summary cards use a bounded source sample. Refine the filters for a narrower, complete summary.</p> : null}
      {data.customerSummaries.length ? <section className="mb-4 overflow-x-auto rounded-2xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-[var(--primary)]">Customer rollup</h2><p className="text-sm text-slate-500">Derived from the same authorized Sales rows; currencies remain separate.</p></div>{data.customerSummaryTruncated ? <span className="text-xs font-semibold text-amber-800">Bounded sample</span> : null}</div><table className="mt-3 w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Customer", "Currency", "Invoiced", "Paid", "Outstanding", "Overdue", "Sales"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.customerSummaries.map((summary) => <tr key={`${summary.customerId}-${summary.currency}`} className="border-t"><td className="p-3"><p className="font-semibold">{summary.companyName || summary.customerName || "Customer"}</p>{summary.companyName && summary.customerName ? <p className="text-xs text-slate-500">{summary.customerName}</p> : null}</td><td className="p-3">{summary.currency}</td><td className="p-3">{money(summary.totalInvoiced, summary.currency)}</td><td className="p-3 text-green-800">{money(summary.totalPaid, summary.currency)}</td><td className="p-3 font-bold text-[var(--primary)]">{money(summary.totalOutstanding, summary.currency)}</td><td className="p-3 text-red-700">{money(summary.totalOverdue, summary.currency)}</td><td className="p-3">{summary.saleCount}</td></tr>)}</tbody></table></section> : null}
      <form className="mb-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <input name="q" defaultValue={filters.search} placeholder="Customer, company, invoice or order" maxLength={80} className="rounded-xl border px-3 py-2 xl:col-span-2" />
        <input name="salesperson" defaultValue={filters.salesperson} placeholder="Salesperson" maxLength={80} className="rounded-xl border px-3 py-2" />
        <input name="currency" defaultValue={filters.currency} placeholder="Currency (e.g. BDT)" maxLength={3} className="rounded-xl border px-3 py-2 uppercase" />
        <select name="status" defaultValue={filters.status} className="rounded-xl border px-3 py-2"><option value="">All payment statuses</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option></select>
        <select name="dueStatus" defaultValue={filters.dueStatus} className="rounded-xl border px-3 py-2"><option value="">All due states</option><option value="not_yet_due">Not yet due</option><option value="due_today">Due today</option><option value="due_soon">Due soon</option><option value="overdue">Overdue</option><option value="no_due_date">No due date</option><option value="paid">Paid</option></select>
        <select name="agingBucket" defaultValue={filters.agingBucket} className="rounded-xl border px-3 py-2"><option value="">All aging buckets</option><option value="not_yet_due">Not yet due</option><option value="due_today">Due today</option><option value="1_30_days_overdue">1–30 overdue</option><option value="31_60_days_overdue">31–60 overdue</option><option value="61_90_days_overdue">61–90 overdue</option><option value="90_plus_days_overdue">90+ overdue</option><option value="no_due_date">No due date</option></select>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Due from<input type="date" name="dueFrom" defaultValue={filters.dueFrom ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Due to<input type="date" name="dueTo" defaultValue={filters.dueTo ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label>
        <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" name="outstandingOnly" value="1" defaultChecked={filters.outstandingOnly} /> Outstanding only</label>
        <button className="rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Apply filters</button>
      </form>
      <section id="customer-statement-links" className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]"><tr>{["Customer", "Order / invoice", "Invoice date", "Salesperson", "Total", "Paid", "Outstanding", "Status", "Due date", "Aging", "Last payment", ""].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.sourceId} className="border-t align-top">
                <td className="p-3"><p className="font-semibold">{row.partyName}</p>{row.companyName && row.companyName !== row.partyName ? <p className="text-xs text-slate-500">{row.companyName}</p> : null}<p className="text-xs text-slate-500">{row.customerEmail ?? row.customerPhone ?? ""}</p></td>
                <td className="p-3"><p>{row.referenceNumber}</p><p className="text-xs text-slate-500">{row.invoiceNumber ?? "Invoice not generated"}</p></td>
                <td className="p-3">{row.invoiceDate ?? "Not set"}</td>
                <td className="p-3">{row.salespersonName}</td>
                <td className="p-3">{money(row.invoiceTotal, row.currency)}</td>
                <td className="p-3 text-green-800">{money(row.paidAmount, row.currency)}</td>
                <td className="p-3 font-bold text-[var(--primary)]">{money(row.outstandingAmount, row.currency)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.dueStatus)}`}>{label(row.dueStatus)}</span><p className="mt-1 text-xs text-slate-500">Payment: {label(row.paymentStatus)}</p></td>
                <td className="p-3">{row.dueDate ?? "Not set"}</td>
                <td className="p-3">{label(row.agingBucket)}{row.daysOverdue != null ? <p className="text-xs text-red-700">{row.daysOverdue} day(s)</p> : null}</td>
                <td className="p-3">{row.lastPaymentDate ?? "—"}</td>
                <td className="p-3"><a href={`/admin/receivables/reports/customers/${row.customerId}`} className="whitespace-nowrap rounded-lg border px-3 py-2 font-semibold text-blue-800 hover:bg-blue-50">Customer statement</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length ? <p className="p-8 text-center text-sm text-slate-500">No authorized Customer Receivables rows match these filters.</p> : null}
      </section>
      <div className="mt-3 flex items-center justify-between text-sm"><span>{data.count} record(s){data.truncated ? " · bounded report sample" : ""}</span><div className="flex gap-2">{data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
      <p className="mt-3 text-xs text-slate-500">Customer collection remains in Sales → Record Payment. This report performs read-only queries only.</p>
    </DashboardShell>
  );
}
