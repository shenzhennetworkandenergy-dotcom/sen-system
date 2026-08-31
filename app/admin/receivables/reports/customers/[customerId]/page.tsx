import { connection } from "next/server";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getCustomerSalesStatement } from "@/lib/receivables/reports-data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";
import { routes } from "@/lib/constants/routes";

export const dynamic = "force-dynamic";

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function inputFromSearchParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value ?? ""]));
}

export default async function CustomerSalesStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_customer"]);
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const [{ customerId }, rawParams] = await Promise.all([params, searchParams]);
  const data = await getCustomerSalesStatement(customerId, inputFromSearchParams(rawParams), reportScope);
  if (!data) notFound();
  const filters = data.filters;
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (filters.search) query.set("q", filters.search);
    if (filters.currency) query.set("currency", filters.currency);
    if (filters.fromDate) query.set("from", filters.fromDate);
    if (filters.toDate) query.set("to", filters.toDate);
    query.set("page", String(page));
    return `${routes.adminReceivableCustomerReports}/${encodeURIComponent(customerId)}?${query.toString()}`;
  };

  return (
    <DashboardShell
      admin={reportScope.isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Customer Sales Statement"
      subtitle="Invoice and successful Sales payment events grouped by currency with a derived running balance. Legacy refund rows are shown only when their effect is supported by the authoritative net payment total."
    >
      <ReceivablesNavigation
        canViewCustomer={reportScope.canViewCustomerReceivables}
        canViewLoans={reportScope.canViewLoans}
        canReconcile={reportScope.canViewAccountingDetails}
        canViewReports
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Customer</p><h2 className="text-xl font-bold text-blue-950">{data.companyName || data.customerName || "Customer"}</h2>{data.companyName && data.customerName ? <p className="text-sm text-blue-800">{data.customerName}</p> : null}</div>
        <div className="text-right text-sm text-blue-900"><p>{data.sourceCount} authorized Sales record(s)</p><p>{data.eventCount} of {data.totalEventCount} statement event(s) shown</p>{data.truncated ? <p className="text-xs font-semibold text-amber-800">Report is bounded; refine filters for older events.</p> : null}</div>
      </div>
      {data.unsupportedFilters.length ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Some supplied filters are not applicable to a Sales statement: {data.unsupportedFilters.join(", ")}.</p> : null}
      <form className="mb-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">From<input type="date" name="from" defaultValue={filters.fromDate ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">To<input type="date" name="to" defaultValue={filters.toDate ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Currency<input name="currency" defaultValue={filters.currency} maxLength={3} placeholder="All currencies" className="rounded-xl border px-3 py-2 text-sm uppercase text-slate-900" /></label>
        <button className="self-end rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Apply filters</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2"><a href={routes.adminReceivableCustomerReports} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">← Customer report</a><a href={routes.adminSales} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Open Sales</a></div>
      {data.groups.map((group) => (
        <section key={group.currency} className="mb-4 overflow-x-auto rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[var(--primary)]">{group.currency} statement</h2><p className="text-sm font-semibold text-[var(--primary)]">Current outstanding: {money(group.closingOutstanding, group.currency)}</p></div>
          <table className="mt-3 w-full min-w-[1080px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Date", "Event", "Order / invoice", "Method", "Reference", "Amount", "Running balance", "Payment state"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{group.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.date}</td><td className="p-3 font-semibold">{row.label}</td><td className="p-3"><p>{row.referenceNumber}</p><p className="text-xs text-slate-500">{row.invoiceNumber ?? "—"}</p></td><td className="p-3">{row.method ?? "—"}</td><td className="p-3 font-mono text-xs">{row.reference ?? "—"}</td><td className={`p-3 font-semibold ${row.direction === "increase" ? "text-blue-900" : "text-green-800"}`}>{row.direction === "increase" ? "+" : "−"}{money(row.amount, group.currency)}</td><td className="p-3 font-bold text-[var(--primary)]">{money(row.runningBalance, group.currency)}</td><td className="p-3">{row.paymentStatus ? label(row.paymentStatus) : row.periodClass === "invoice" ? "Invoice" : "—"}</td></tr>)}</tbody></table>
          {!group.rows.length ? <p className="p-6 text-center text-sm text-slate-500">No events match the selected date filters.</p> : null}
        </section>
      ))}
      <div className="mt-3 flex items-center justify-between text-sm"><span>{data.eventCount} event(s) on this page</span><div className="flex gap-2">{filters.page > 1 ? <a href={pageHref(filters.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.hasNextPage ? <a href={pageHref(filters.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
    </DashboardShell>
  );
}
