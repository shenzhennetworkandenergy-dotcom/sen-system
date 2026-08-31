import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getReceivableAccountingReconciliation } from "@/lib/receivables/data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number, currency: string) => new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export default async function ReceivablesReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions([
    "receivables.view",
    "receivables.view_loans",
    "accounting.view",
  ]);
  const params = await searchParams;
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const isAdmin = reportScope.isAdmin;
  const data = await getReceivableAccountingReconciliation(params, reportScope);
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (data.search) query.set("q", data.search);
    query.set("page", String(page));
    return `?${query.toString()}`;
  };

  return (
    <DashboardShell
      admin={isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Accounting Reconciliation"
      subtitle="Read-only links between non-Sales Receivable movements, journals, and the Quick Cash Book."
    >
      <ReceivablesNavigation canViewCustomer={reportScope.canViewCustomerReceivables} canViewLoans={reportScope.canViewLoans} canReconcile={reportScope.canViewAccountingDetails} />
      <section className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
        Historical opening balances and ambiguous/non-BDT operations remain visibly unposted or marked Needs Review. This view does not create or edit financial records.
      </section>
      <form className="mb-4 flex flex-wrap gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <input name="q" defaultValue={data.search} placeholder="Receivable number, borrower, journal" maxLength={80} className="min-w-[16rem] flex-1 rounded-xl border px-3 py-2" />
        <button className="rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-white">Search</button>
      </form>
      <section data-read-model="receivable_accounting_reconciliation_v" className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[var(--primary)]">Posting links</h2><span className="text-sm text-slate-500">{data.count} movement(s)</span></div>
        {data.rows.length ? (
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-100"><tr>{["Receivable","Borrower","Date","Movement","Treatment","Status","Journal","Cash Book","Source"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.receivableTransactionId} className="border-t"><td className="p-3"><a href={`/admin/receivables/loans/${row.receivableAccountId}`} className="font-semibold text-blue-800 hover:underline">{row.receivableNumber}</a></td><td className="p-3">{row.borrowerName}</td><td className="p-3">{row.effectiveDate}</td><td className="p-3">{label(row.transactionType)} · {row.direction === "increase" ? "+" : "−"}{money(row.amount, row.currency)}</td><td className="p-3">{row.accountingTreatment ? label(row.accountingTreatment) : "Not set"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.postingStatus === "posted" ? "bg-green-100 text-green-800" : row.postingStatus === "needs_review" ? "bg-amber-100 text-amber-900" : row.postingStatus === "reversed" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-800"}`}>{label(row.postingStatus)}</span></td><td className="p-3">{row.journalEntryNumber ?? "—"}</td><td className="p-3">{row.cashbookEntryId ? "Linked" : "—"}</td><td className="p-3">{label(row.source)}</td></tr>)}</tbody></table></div>
        ) : <p className="mt-4 text-sm text-slate-500">No non-Sales Receivable Accounting movements are available.</p>}
        <div className="mt-4 flex items-center justify-between text-sm"><span>Page {data.page}</span><div className="flex gap-2">{data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Previous</a> : null}{data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded-lg border px-3 py-1.5 font-semibold">Next</a> : null}</div></div>
      </section>
    </DashboardShell>
  );
}
