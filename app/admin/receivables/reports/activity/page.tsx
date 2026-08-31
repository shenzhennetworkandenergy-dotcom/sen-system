import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requirePermission } from "@/lib/auth/permissions";
import { getReceivablesActivityReport } from "@/lib/receivables/reports-data";
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

export default async function ReceivablesActivityReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const { profile, permissions } = await requirePermission("receivables.view");
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const rawParams = await searchParams;
  const data = await getReceivablesActivityReport(inputFromSearchParams(rawParams), reportScope);
  const filters = data.filters;
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (filters.search) query.set("q", filters.search);
    if (filters.source !== "all") query.set("source", filters.source);
    if (filters.currency) query.set("currency", filters.currency);
    if (filters.customerId) query.set("customerId", filters.customerId);
    if (filters.accountId) query.set("accountId", filters.accountId);
    if (filters.borrower) query.set("borrower", filters.borrower);
    if (filters.salesperson) query.set("salesperson", filters.salesperson);
    if (filters.paymentMethod) query.set("paymentMethod", filters.paymentMethod);
    if (filters.movementType) query.set("movementType", filters.movementType);
    if (filters.fromDate) query.set("from", filters.fromDate);
    if (filters.toDate) query.set("to", filters.toDate);
    if (filters.includeAdjustments) query.set("includeAdjustments", "1");
    query.set("page", String(page));
    return `${routes.adminReceivableActivityReports}?${query.toString()}`;
  };
  const statusTone = (kind: string) => kind === "customer_refund" ? "bg-red-100 text-red-800" : kind === "reversal" ? "bg-slate-200 text-slate-700" : kind === "non_cash_adjustment" ? "bg-amber-100 text-amber-900" : kind === "non_sales_disbursement" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800";

  return (
    <DashboardShell admin={reportScope.isAdmin} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Collections & Activity" subtitle="Read-only activity across authorized Sales collections and Non-Sales operational movements. Legacy Sales refund effects are capped to the authoritative net payment total.">
      <ReceivablesNavigation canViewCustomer={reportScope.canViewCustomerReceivables} canViewLoans={reportScope.canViewLoans} canReconcile={reportScope.canViewAccountingDetails} canViewReports />
      {data.summaries.length ? <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.summaries.map((summary) => <article key={summary.currency} className="rounded-xl border bg-white p-3 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold text-[var(--primary)]">{summary.currency}</h2><span className="text-xs text-slate-500">activity totals</span></div><dl className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Customer collections</dt><dd className="font-bold text-green-800">{money(summary.customerCollections, summary.currency)}</dd></div><div><dt className="text-slate-500">Non-Sales repayments</dt><dd className="font-bold text-green-800">{money(summary.nonSalesRepayments, summary.currency)}</dd></div><div><dt className="text-slate-500">Adjustments</dt><dd className="font-semibold text-amber-800">{money(summary.adjustments, summary.currency)}</dd></div><div><dt className="text-slate-500">Refunds</dt><dd className="font-semibold text-red-700">{money(summary.refunds, summary.currency)}</dd></div>{summary.reversals != null ? <div><dt className="text-slate-500">Reversals</dt><dd className="font-semibold text-slate-700">{money(summary.reversals, summary.currency)}</dd></div> : null}{summary.openingBalances != null ? <div><dt className="text-slate-500">Opening balances</dt><dd className="font-semibold text-slate-700">{money(summary.openingBalances, summary.currency)}</dd></div> : null}{summary.disbursements != null ? <div><dt className="text-slate-500">Disbursements</dt><dd className="font-semibold text-blue-800">{money(summary.disbursements, summary.currency)}</dd></div> : null}</dl></article>)}</section> : null}
      {data.unsupportedFilters.length ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Some supplied filters are not applicable to the selected activity source: {data.unsupportedFilters.join(", ")}.</p> : null}
      {data.truncated ? <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">This activity report is bounded for safety; refine the date or source filters for a narrower result.</p> : null}
      <form className="mb-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-6"><input name="q" defaultValue={filters.search} placeholder="Customer, borrower or reference" maxLength={80} className="rounded-xl border px-3 py-2 xl:col-span-2" /><select name="source" defaultValue={filters.source} className="rounded-xl border px-3 py-2"><option value="all">Collections and repayments</option><option value="customer_collection">Customer collections</option><option value="customer_refund">Customer refunds</option><option value="customer_sales">Customer Sales activity</option><option value="non_sales_repayment">Non-Sales repayments</option><option value="non_sales_adjustment">Non-Sales adjustments</option><option value="non_sales_opening">Opening balances</option><option value="non_sales_disbursement">Disbursements</option><option value="reversal">Reversals</option></select><input name="customerId" defaultValue={filters.customerId} placeholder="Customer ID" maxLength={80} className="rounded-xl border px-3 py-2" /><input name="accountId" defaultValue={filters.accountId} placeholder="Receivable ID" maxLength={80} className="rounded-xl border px-3 py-2" /><input name="borrower" defaultValue={filters.borrower} placeholder="Borrower" maxLength={80} className="rounded-xl border px-3 py-2" /><input name="salesperson" defaultValue={filters.salesperson} placeholder="Salesperson" maxLength={80} className="rounded-xl border px-3 py-2" /><input name="currency" defaultValue={filters.currency} placeholder="Currency" maxLength={3} className="rounded-xl border px-3 py-2 uppercase" /><input name="paymentMethod" defaultValue={filters.paymentMethod} placeholder="Payment method" maxLength={60} className="rounded-xl border px-3 py-2" /><input name="movementType" defaultValue={filters.movementType} placeholder="Movement type" maxLength={60} className="rounded-xl border px-3 py-2" /><label className="grid gap-1 text-xs font-semibold text-slate-600">From<input type="date" name="from" defaultValue={filters.fromDate ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">To<input type="date" name="to" defaultValue={filters.toDate ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label><label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"><input type="checkbox" name="includeAdjustments" value="1" defaultChecked={filters.includeAdjustments} /> Include adjustments</label><button className="rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Apply filters</button></form>
      <section className="overflow-x-auto rounded-2xl border bg-white p-4 shadow-sm"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Date", "Activity", "Source", "Party", "Reference", "Category", "Currency", "Amount", "Method", "Salesperson", "Reversal"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.date}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.kind)}`}>{row.label}</span></td><td className="p-3">{row.sourceType === "customer_sale" ? "Customer Sale" : "Non-Sales"}</td><td className="p-3">{row.partyName}</td><td className="p-3 font-semibold">{row.reference}</td><td className="p-3">{row.category ? label(row.category) : "—"}</td><td className="p-3">{row.currency}</td><td className="p-3 font-bold text-[var(--primary)]">{money(row.amount, row.currency)}</td><td className="p-3">{row.paymentMethod ?? "—"}</td><td className="p-3">{row.salespersonName ?? "—"}</td><td className="p-3">{row.reversalOfId ? "Reversal" : "—"}</td></tr>)}</tbody></table>{!data.rows.length ? <p className="p-8 text-center text-sm text-slate-500">No authorized activity matches these filters.</p> : null}</section>
      <div className="mt-3 flex items-center justify-between text-sm"><span>{data.count} event(s){data.truncated ? " · bounded report sample" : ""}</span><div className="flex gap-2">{data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
      <p className="mt-3 text-xs text-slate-500">Customer collections continue through Sales → Record Payment. This view does not create a second payment or journal.</p>
    </DashboardShell>
  );
}
