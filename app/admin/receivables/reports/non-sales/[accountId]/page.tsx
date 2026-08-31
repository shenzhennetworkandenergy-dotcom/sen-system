import { connection } from "next/server";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getNonSalesAccountStatement } from "@/lib/receivables/reports-data";
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

export default async function NonSalesAccountStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const [{ accountId }, rawParams] = await Promise.all([params, searchParams]);
  const data = await getNonSalesAccountStatement(accountId, inputFromSearchParams(rawParams), reportScope);
  if (!data) notFound();
  const { account } = data;
  const filters = data.filters;
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (filters.currency) query.set("currency", filters.currency);
    if (filters.fromDate) query.set("from", filters.fromDate);
    if (filters.toDate) query.set("to", filters.toDate);
    if (filters.source !== "all") query.set("source", filters.source);
    if (filters.paymentMethod) query.set("paymentMethod", filters.paymentMethod);
    if (filters.movementType) query.set("movementType", filters.movementType);
    query.set("page", String(page));
    return `/admin/receivables/reports/non-sales/${encodeURIComponent(accountId)}?${query.toString()}`;
  };

  return (
    <DashboardShell
      admin={reportScope.isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={`${account.receivableNumber} Statement`}
      subtitle="Immutable operational movements for this non-Sales Receivable account."
    >
      <ReceivablesNavigation
        canViewCustomer={reportScope.canViewCustomerReceivables}
        canViewLoans={reportScope.canViewLoans}
        canReconcile={reportScope.canViewAccountingDetails}
        canViewReports
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{label(account.category)} · {label(account.borrowerType)}</p><h2 className="text-xl font-bold text-violet-950">{account.borrowerName}</h2><p className="text-sm text-violet-900">{account.isOpeningBalance ? "Opening / existing receivable" : "Operational receivable"} · {label(account.status)}</p></div><div className="text-right"><p className="text-xs uppercase tracking-wide text-violet-700">Current outstanding</p><p className="text-2xl font-bold text-violet-950">{money(account.outstandingAmount, account.currency)}</p><p className="text-xs text-violet-800">{account.currency}</p></div></div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Original amount</p><p className="mt-1 font-bold">{money(account.originalAmount, account.currency)}</p></article><article className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Disbursed / opening</p><p className="mt-1 font-bold">{money(account.disbursedAmount + account.openingPrincipal, account.currency)}</p></article><article className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Repaid</p><p className="mt-1 font-bold text-green-800">{money(account.repaidAmount, account.currency)}</p></article><article className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Adjustment net</p><p className="mt-1 font-bold">{money(account.adjustmentAmount, account.currency)}</p></article></div>
      <div className="mb-4 flex flex-wrap gap-2"><a href={routes.adminReceivableNonSalesReports} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">← Non-Sales report</a>{reportScope.canViewAccountingDetails ? <a href={routes.adminReceivablesReconciliation} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Accounting reconciliation</a> : null}</div>
      {data.unsupportedFilters.length ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Some supplied filters are not applicable to this statement: {data.unsupportedFilters.join(", ")}.</p> : null}
      <form className="mb-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">From<input type="date" name="from" defaultValue={filters.fromDate ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">To<input type="date" name="to" defaultValue={filters.toDate ?? ""} className="rounded-xl border px-3 py-2 text-sm text-slate-900" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Currency<input name="currency" defaultValue={filters.currency} maxLength={3} placeholder="All currencies" className="rounded-xl border px-3 py-2 text-sm uppercase text-slate-900" /></label>
        <select name="source" defaultValue={filters.source} className="rounded-xl border px-3 py-2 text-sm"><option value="all">All movements</option><option value="non_sales_opening">Historical opening</option><option value="non_sales_disbursement">Disbursements</option><option value="non_sales_repayment">Repayments</option><option value="non_sales_adjustment">Adjustments</option><option value="reversal">Reversals</option></select>
        <input name="paymentMethod" defaultValue={filters.paymentMethod} placeholder="Payment method" maxLength={60} className="rounded-xl border px-3 py-2 text-sm" />
        <input name="movementType" defaultValue={filters.movementType} placeholder="Movement type" maxLength={60} className="rounded-xl border px-3 py-2 text-sm" />
        <button className="self-end rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Apply filters</button>
      </form>
      <section className="overflow-x-auto rounded-2xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[var(--primary)]">Transaction history</h2><span className="text-sm text-slate-500">Current outstanding: {money(data.closingOutstanding, account.currency)}</span></div><table className="mt-3 w-full min-w-[1120px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Date", "Movement", "Direction", "Amount", "Running balance", "Method", "Source", "Reference", "Reversal"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.date}</td><td className="p-3 font-semibold">{row.label}</td><td className="p-3">{row.direction === "increase" ? "Increase" : "Decrease"}</td><td className={`p-3 font-semibold ${row.direction === "increase" ? "text-blue-900" : "text-green-800"}`}>{row.direction === "increase" ? "+" : "−"}{money(row.amount, account.currency)}</td><td className="p-3 font-bold text-[var(--primary)]">{money(row.runningBalance, account.currency)}</td><td className="p-3">{row.paymentMethod ?? "—"}</td><td className="p-3">{row.source || "Operational"}</td><td className="p-3 font-mono text-xs">{row.operationId ?? "—"}</td><td className="p-3">{row.reversalOfId ? "Reverses prior movement" : "—"}</td></tr>)}</tbody></table>{!data.rows.length ? <p className="p-6 text-center text-sm text-slate-500">No operational movements are available.</p> : null}{data.truncated ? <p className="mt-3 text-xs text-amber-800">History is bounded for safety; refine the date filters to inspect a narrower period.</p> : null}</section>
      <div className="mt-3 flex items-center justify-between text-sm"><span>{data.rows.length} of {data.totalRows} movement(s) shown</span><div className="flex gap-2">{filters.page > 1 ? <a href={pageHref(filters.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.hasNextPage ? <a href={pageHref(filters.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
      <p className="mt-3 text-xs text-slate-500">Opening balances are operational history markers and do not fabricate prior Accounting or Cash Book entries.</p>
    </DashboardShell>
  );
}
