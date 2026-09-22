import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import {
  getCustomerReceivables,
  getCustomerReceivableSummaries,
} from "@/lib/receivables/data";
import { formatCommercialTerms } from "@/lib/sales/commercial-terms";
import { resolveSalesVisibilityScope } from "@/lib/sales/visibility";

export const dynamic = "force-dynamic";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusTone = (status: string) => {
  if (status === "paid") return "bg-green-100 text-green-800";
  if (status === "overdue") return "bg-red-100 text-red-800";
  if (status === "due_soon") return "bg-amber-100 text-amber-900";
  if (status === "no_due_date") return "bg-slate-100 text-slate-700";
  return "bg-blue-100 text-blue-800";
};

export default async function CustomerReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions([
    "receivables.view",
    "receivables.view_customer",
  ]);
  const params = await searchParams;
  const isAdmin = profile.role === "admin";
  const salesScope = resolveSalesVisibilityScope({
    role: profile.role,
    status: profile.status,
    profileId: profile.id,
    permissions,
  });
  const [data, summaries] = await Promise.all([
    getCustomerReceivables(params, { canViewCustomer: true, salesScope }),
    getCustomerReceivableSummaries(salesScope),
  ]);
  const canViewLoans = isAdmin || permissions.has("receivables.view_loans");
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (data.search) query.set("q", data.search);
    if (data.paymentStatus) query.set("paymentStatus", data.paymentStatus);
    if (data.receivablesStatus) query.set("receivablesStatus", data.receivablesStatus);
    if (data.agingBucket) query.set("agingBucket", data.agingBucket);
    if (data.dueFrom) query.set("dueFrom", data.dueFrom);
    if (data.dueTo) query.set("dueTo", data.dueTo);
    if (data.salesperson) query.set("salesperson", data.salesperson);
    if (data.outstandingOnly) query.set("outstandingOnly", "1");
    query.set("page", String(page));
    return `?${query.toString()}`;
  };

  return (
    <DashboardShell
      admin={isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Customer Receivables"
      subtitle="Read-only outstanding derived from existing Sales invoices and successful Sales payments."
    >
      <ReceivablesNavigation canViewCustomer canViewLoans={canViewLoans} />
      <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Record customer collections through the existing Sales → Record Payment workflow. This page does not create another payment or Accounting entry.
      </div>
      {salesScope.kind === "none" ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Customer Receivables also follows Sales visibility. No Sales view scope is assigned to this account.
        </p>
      ) : null}
      {summaries.length ? (
        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--primary)]">Customer outstanding summary</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summaries.slice(0, 6).map((summary) => (
              <article key={`${summary.customerId}-${summary.currency}`} className="rounded-xl border bg-[var(--muted-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{summary.companyName || summary.customerName || "Customer"}</p>
                    {summary.companyName && summary.customerName ? <p className="text-xs text-[var(--muted-text)]">{summary.customerName}</p> : null}
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">{summary.currency}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-[var(--muted-text)]">Invoiced</dt><dd className="font-semibold">{money(summary.totalInvoiced, summary.currency)}</dd></div>
                  <div><dt className="text-[var(--muted-text)]">Paid</dt><dd className="font-semibold text-green-800">{money(summary.totalPaid, summary.currency)}</dd></div>
                  <div><dt className="text-[var(--muted-text)]">Outstanding</dt><dd className="font-bold text-[var(--primary)]">{money(summary.totalOutstanding, summary.currency)}</dd></div>
                  <div><dt className="text-[var(--muted-text)]">Overdue</dt><dd className="font-bold text-red-700">{money(summary.totalOverdue, summary.currency)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <form className="mb-4 grid gap-2 rounded-xl border bg-white p-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          name="q"
          defaultValue={data.search}
          placeholder="Customer, company, order, invoice, phone, email"
          maxLength={80}
          className="min-w-0 rounded-lg border px-3 py-2 xl:col-span-2"
        />
        <input name="salesperson" defaultValue={data.salesperson} placeholder="Salesperson" maxLength={80} className="rounded-lg border px-3 py-2" />
        <select name="paymentStatus" defaultValue={data.paymentStatus} className="rounded-lg border px-3 py-2">
          <option value="">All payment statuses</option>
          <option value="unpaid">Unpaid</option><option value="partially_paid">Partially Paid</option><option value="paid">Paid</option>
        </select>
        <select name="receivablesStatus" defaultValue={data.receivablesStatus} className="rounded-lg border px-3 py-2">
          <option value="">All receivables statuses</option>
          <option value="current">Current</option><option value="due_soon">Due Soon</option><option value="overdue">Overdue</option><option value="no_due_date">No Due Date</option><option value="paid">Paid</option>
        </select>
        <select name="agingBucket" defaultValue={data.agingBucket} className="rounded-lg border px-3 py-2">
          <option value="">All aging buckets</option>
          <option value="not_yet_due">Not Yet Due</option><option value="due_today">Due Today</option><option value="1_30_days_overdue">1–30 Days Overdue</option><option value="31_60_days_overdue">31–60 Days Overdue</option><option value="61_90_days_overdue">61–90 Days Overdue</option><option value="90_plus_days_overdue">90+ Days Overdue</option><option value="no_due_date">No Due Date</option><option value="paid">Paid</option>
        </select>
        <label className="grid gap-1 text-xs text-[var(--muted-text)]">Due from<input type="date" name="dueFrom" defaultValue={data.dueFrom} className="rounded-lg border px-3 py-2 text-sm text-[var(--foreground)]" /></label>
        <label className="grid gap-1 text-xs text-[var(--muted-text)]">Due to<input type="date" name="dueTo" defaultValue={data.dueTo} className="rounded-lg border px-3 py-2 text-sm text-[var(--foreground)]" /></label>
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" name="outstandingOnly" value="1" defaultChecked={data.outstandingOnly} />Outstanding only</label>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Apply filters</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[1750px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]">
            <tr>{["Customer", "Order", "Invoice", "Invoice date", "Salesperson", "Invoice amount", "Paid", "Outstanding", "Payment", "Receivables", "Terms", "Credit", "Due date", "Days overdue", "Aging", "Last payment", ""].map((head) => <th key={head} className="p-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.sourceId} className="border-t">
                <td className="p-3"><p className="font-semibold">{row.partyName}</p>{row.companyName && row.companyName !== row.partyName ? <p className="text-xs text-[var(--muted-text)]">{row.companyName}</p> : null}</td>
                <td className="p-3">{row.referenceNumber}</td>
                <td className="p-3">{row.invoiceNumber ?? "Not generated"}</td>
                <td className="p-3">{row.invoiceDate ?? "Not generated"}</td>
                <td className="p-3">{row.salespersonName}</td>
                <td className="p-3">{money(row.originalAmount, row.currency)}</td>
                <td className="p-3 text-green-800">{money(row.paidAmount, row.currency)}</td>
                <td className="p-3 font-bold text-[var(--primary)]">{money(row.outstandingAmount, row.currency)}</td>
                <td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">{label(row.paymentStatus)}</span></td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.receivablesStatus)}`}>{label(row.receivablesStatus)}</span></td>
                <td className="p-3">{formatCommercialTerms({ paymentTermsType: row.paymentTermsType as "immediate" | "partial" | "credit" | null, creditPeriodDays: row.creditPeriodDays, paymentDueDate: row.paymentDueDate })}</td>
                <td className="p-3">{row.creditPeriodDays ? `${row.creditPeriodDays} days` : "—"}</td>
                <td className="p-3">{row.dueDate ?? "Not set"}</td>
                <td className="p-3">{row.daysOverdue ?? "—"}</td>
                <td className="p-3">{label(row.agingBucket)}</td>
                <td className="p-3">{row.lastPaymentDate ?? "—"}</td>
                <td className="p-3"><a href={`/admin/sales/${row.sourceId}`} className="rounded-lg border px-3 py-2 font-semibold">Open Sale</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length ? <p className="p-8 text-center text-[var(--muted-text)]">No customer receivables match this search.</p> : null}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>{data.count} Sales record(s)</span>
        <div className="flex gap-2">
          {data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded border px-3 py-1.5">Previous</a> : null}
          {data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded border px-3 py-1.5">Next</a> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
