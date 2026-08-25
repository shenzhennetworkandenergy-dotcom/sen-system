import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import {
  OpeningReceivableForm,
  RequestedReceivableForm,
  type ReceivablePartyOptions,
} from "@/components/receivables/ReceivableAccountForms";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getNonSalesReceivables, getReceivablePartyOptions } from "@/lib/receivables/data";

export const dynamic = "force-dynamic";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function relationName(value: unknown) {
  const related = value as { full_name?: string | null; email?: string | null } | { full_name?: string | null; email?: string | null }[] | null;
  const profile = Array.isArray(related) ? related[0] : related;
  return profile?.full_name || profile?.email || "Employee";
}

export default async function ReceivableLoansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions([
    "receivables.view",
    "receivables.view_loans",
  ]);
  const params = await searchParams;
  const isAdmin = profile.role === "admin";
  const canViewCustomer = isAdmin || permissions.has("receivables.view_customer");
  const canCreate = isAdmin || permissions.has("receivables.create");
  const canManageOpening = isAdmin || permissions.has("receivables.manage_opening");
  const [data, rawOptions] = await Promise.all([
    getNonSalesReceivables(params, { canViewLoans: true }),
    getReceivablePartyOptions({ canManageAccounts: canCreate || canManageOpening }),
  ]);
  const options: ReceivablePartyOptions = {
    employees: rawOptions.employees.map((item) => ({
      id: item.id,
      label: `${item.employee_number} · ${relationName(item.profiles)}`,
    })),
    customers: rawOptions.customers.map((item) => ({
      id: item.id,
      label: item.company_name || item.full_name || item.email || "Customer",
    })),
    suppliers: rawOptions.suppliers.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })),
    crmCompanies: rawOptions.crmCompanies.map((item) => ({ id: item.id, label: item.name })),
    crmContacts: rawOptions.crmContacts.map((item) => ({ id: item.id, label: item.full_name })),
    externalParties: rawOptions.externalParties.map((item) => ({ id: item.id, label: item.display_name })),
  };
  const query = data.search ? `&q=${encodeURIComponent(data.search)}` : "";

  return (
    <DashboardShell
      admin={isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Loans & Advances"
      subtitle="Non-Sales receivable accounts and opening balances. Financial posting is intentionally deferred."
    >
      <ReceivablesNavigation canViewCustomer={canViewCustomer} canViewLoans />
      <section className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--primary)]">Operational accounts</h2>
            <p className="text-sm text-[var(--muted-text)]">Opening balance records are clearly marked and do not create fake historical cash transactions.</p>
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">Phase 1 foundation</span>
        </div>
      </section>
      <form className="mb-4 flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row">
        <input name="q" defaultValue={data.search} placeholder="Borrower or receivable number" maxLength={80} className="min-w-0 flex-1 rounded-lg border px-3 py-2" />
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Search</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]"><tr>{["Receivable", "Borrower", "Type", "Original", "Repaid / adjusted", "Outstanding", "Status", "Due", "Source"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.sourceId} className="border-t">
                <td className="p-3 font-semibold">{row.referenceNumber}</td>
                <td className="p-3">{row.partyName}</td>
                <td className="p-3">{label(row.receivableType)}</td>
                <td className="p-3">{money(row.originalAmount, row.currency)}</td>
                <td className="p-3 text-green-800">{money(row.paidAmount, row.currency)}</td>
                <td className="p-3 font-bold text-[var(--primary)]">{money(row.outstandingAmount, row.currency)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.receivableStatus === "requested" ? "bg-slate-100 text-slate-700" : row.receivableStatus === "fully_repaid" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{label(row.receivableStatus)}</span></td>
                <td className="p-3">{row.dueDate ?? "Not set"}</td>
                <td className="p-3">{row.isOpeningBalance ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Opening balance</span> : "New request"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length ? <p className="p-8 text-center text-[var(--muted-text)]">No non-Sales receivables match this search.</p> : null}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>{data.count} account(s)</span>
        <div className="flex gap-2">
          {data.page > 1 ? <a href={`?page=${data.page - 1}${query}`} className="rounded border px-3 py-1.5">Previous</a> : null}
          {data.page * data.pageSize < data.count ? <a href={`?page=${data.page + 1}${query}`} className="rounded border px-3 py-1.5">Next</a> : null}
        </div>
      </div>

      {canCreate || canManageOpening ? (
        <section className="mt-6 grid gap-5 2xl:grid-cols-2">
          {canCreate ? <RequestedReceivableForm operationId={crypto.randomUUID()} options={options} /> : null}
          {canManageOpening ? <OpeningReceivableForm operationId={crypto.randomUUID()} options={options} /> : null}
        </section>
      ) : null}
    </DashboardShell>
  );
}
