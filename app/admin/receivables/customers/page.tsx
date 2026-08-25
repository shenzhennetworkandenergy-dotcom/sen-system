import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getCustomerReceivables } from "@/lib/receivables/data";

export const dynamic = "force-dynamic";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

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
  const data = await getCustomerReceivables(params, { canViewCustomer: true });
  const isAdmin = profile.role === "admin";
  const canViewLoans = isAdmin || permissions.has("receivables.view_loans");
  const query = data.search ? `&q=${encodeURIComponent(data.search)}` : "";

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
      <form className="mb-4 flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row">
        <input
          name="q"
          defaultValue={data.search}
          placeholder="Customer, order, or invoice"
          maxLength={80}
          className="min-w-0 flex-1 rounded-lg border px-3 py-2"
        />
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Search</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]">
            <tr>{["Customer", "Order", "Invoice", "Invoice amount", "Paid", "Outstanding", "Status", "Invoice date", "Due date", "Last payment", ""].map((head) => <th key={head} className="p-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.sourceId} className="border-t">
                <td className="p-3 font-semibold">{row.partyName}</td>
                <td className="p-3">{row.referenceNumber}</td>
                <td className="p-3">{row.invoiceNumber ?? "Not generated"}</td>
                <td className="p-3">{money(row.originalAmount, row.currency)}</td>
                <td className="p-3 text-green-800">{money(row.paidAmount, row.currency)}</td>
                <td className="p-3 font-bold text-[var(--primary)]">{money(row.outstandingAmount, row.currency)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.receivableStatus === "paid" ? "bg-green-100 text-green-800" : row.receivableStatus === "partially_paid" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>{label(row.receivableStatus)}</span></td>
                <td className="p-3">{row.issueDate}</td>
                <td className="p-3">{row.dueDate ?? "Not set"}</td>
                <td className="p-3">{row.lastActivityDate ?? "—"}</td>
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
          {data.page > 1 ? <a href={`?page=${data.page - 1}${query}`} className="rounded border px-3 py-1.5">Previous</a> : null}
          {data.page * data.pageSize < data.count ? <a href={`?page=${data.page + 1}${query}`} className="rounded border px-3 py-1.5">Next</a> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
