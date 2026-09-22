import { connection } from "next/server";
import Link from "next/link";

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
  const pageQuery = new URLSearchParams();
  if (data.search) pageQuery.set("q", data.search);
  if (data.filters.category) pageQuery.set("category", data.filters.category);
  if (data.filters.status) pageQuery.set("status", data.filters.status);
  if (data.filters.borrowerType) pageQuery.set("borrowerType", data.filters.borrowerType);
  if (data.filters.currency) pageQuery.set("currency", data.filters.currency);
  if (data.filters.outstandingOnly) pageQuery.set("outstandingOnly", "1");
  const pageHref = (page: number) => {
    const query = new URLSearchParams(pageQuery);
    query.set("page", String(page));
    return `?${query.toString()}`;
  };

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
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">Phase 3 operational</span>
        </div>
      </section>
      <form className="mb-4 grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-3 xl:grid-cols-7">
        <label className="text-xs font-semibold text-slate-700 xl:col-span-2">Search<input name="q" defaultValue={data.search} placeholder="Borrower or receivable number" maxLength={80} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="text-xs font-semibold text-slate-700">Category<select name="category" defaultValue={data.filters.category} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">All categories</option>{["employee_loan","salary_advance","customer_loan","company_loan","individual_loan","supplier_refundable_advance","security_deposit","rent_advance","recoverable_advance","other"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-700">Status<select name="status" defaultValue={data.filters.status} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">All statuses</option>{["requested","under_review","approved","active","fully_repaid","rejected","cancelled"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-700">Borrower<select name="borrowerType" defaultValue={data.filters.borrowerType} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">All borrowers</option>{["employee","customer","supplier","crm_company","crm_contact","external_party"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-700">Currency<input name="currency" defaultValue={data.filters.currency} maxLength={3} placeholder="BDT" className="mt-1 w-full rounded-lg border px-3 py-2 uppercase" /></label>
        <div className="flex items-end gap-2"><label className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-700"><input type="checkbox" name="outstandingOnly" value="1" defaultChecked={data.filters.outstandingOnly} /> Outstanding only</label><button className="ml-auto rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Filter</button></div>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]"><tr>{["Receivable", "Borrower", "Type", "Original", "Repaid / adjusted", "Outstanding", "Status", "Due", "Source"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.sourceId} className="border-t">
                <td className="p-3 font-semibold"><Link href={`/admin/receivables/loans/${row.sourceId}`} className="text-blue-800 underline-offset-2 hover:underline">{row.referenceNumber}</Link></td>
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
          {data.page > 1 ? <a href={pageHref(data.page - 1)} className="rounded border px-3 py-1.5">Previous</a> : null}
          {data.page * data.pageSize < data.count ? <a href={pageHref(data.page + 1)} className="rounded border px-3 py-1.5">Next</a> : null}
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
