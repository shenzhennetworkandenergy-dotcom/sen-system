import { connection } from "next/server";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/Shell";
import { JournalForm } from "@/components/accounting/JournalForm";
import { QuickCashbook } from "@/components/accounting/QuickCashbook";
import {
  getBusinessDate,
  getBusinessDateTimeLocal,
  formatCashbookPredecessorError,
  isPersonalCashbookPredecessorError,
  normalizeCashbookDate,
} from "@/lib/accounting/cashbook";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getAccountingDashboard, getBlockingPersonalCashbookDate, getPersonalCashbookCorrections } from "@/lib/accounting/data";
import { postJournalAction } from "./actions";

export const dynamic = "force-dynamic";
const money = (value: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).format(value);

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; cashbook_date?: string }> }) {
  await connection();
  const { profile, permissions } = await requireAnyPermission(["accounting.view", "accounting.manage_cashbook"]);
  const params = await searchParams;
  const today = getBusinessDate();
  const currentBusinessDateTime = getBusinessDateTimeLocal();
  const selectedDate = normalizeCashbookDate(params.cashbook_date, today);
  const canViewLedger = profile.role === "admin" || permissions.has("accounting.view");
  const [data, correctionRequests] = await Promise.all([
    getAccountingDashboard(selectedDate, {
      includeLedger: canViewLedger,
      cashbookOwnerId: profile.id,
    }),
    getPersonalCashbookCorrections(profile.id),
  ]);
  const errorMessage = isPersonalCashbookPredecessorError(params.error)
    ? formatCashbookPredecessorError(params.error, await getBlockingPersonalCashbookDate(profile.id, selectedDate))
    : params.error;
  const canManageCashbook = profile.role === "admin" || permissions.has("accounting.create_entry") || permissions.has("accounting.manage_cashbook");
  const canCreateJournal = profile.role === "admin" || permissions.has("accounting.create_entry");
  const canPost = profile.role === "admin" || permissions.has("accounting.approve_entry");
  const posted = data.entries.filter((entry) => entry.status === "posted");
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Accounting" subtitle={canViewLedger ? "Chart of accounts, balanced journals and an auditable general-ledger foundation." : "কুইক ক্যাশবুক ও ক্যাশ ক্লোজিং সিস্টেম"}>
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {errorMessage ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{errorMessage}</p> : null}
    <details className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 print:hidden" open={correctionRequests.length > 0}>
      <summary className="cursor-pointer font-bold text-amber-950">Correction Requests ({correctionRequests.length})</summary>
      {correctionRequests.length ? <ul className="mt-3 divide-y divide-amber-200">
        {correctionRequests.map((request) => <li key={request.cashbook_day_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0">
            <p className="font-semibold">{request.business_date} · Pending Correction</p>
            <p className="whitespace-pre-wrap break-words text-sm">{request.correction_reason}</p>
          </div>
          <Link href={`/admin/accounting?cashbook_date=${request.business_date}`} className="rounded-lg border border-amber-700 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100">
            {canManageCashbook ? "Open for Correction" : "View Returned Day"}
          </Link>
        </li>)}
      </ul> : <p className="mt-2 text-sm">No cashbook days are waiting for correction.</p>}
    </details>
    <QuickCashbook
      key={selectedDate}
      selectedDate={selectedDate}
      defaultOccurredAt={selectedDate === today ? currentBusinessDateTime : `${selectedDate}T12:00`}
      statementGeneratedAt={currentBusinessDateTime}
      descriptions={data.cashbook.descriptions}
      entries={data.cashbook.entries}
      summary={data.cashbook.summary}
      day={data.cashbook.day}
      canCreate={canManageCashbook}
      canCreateDescription={profile.role === "admin"}
    />
    {canViewLedger ? <><section className="mb-6 mt-6 grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Active accounts</p><strong className="mt-2 block text-3xl">{data.accounts.filter((account) => account.is_active).length}</strong></article>
      <article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Posted journals</p><strong className="mt-2 block text-3xl">{posted.length}</strong></article>
      <article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Posted value</p><strong className="mt-2 block text-2xl">{money(posted.reduce((sum, entry) => sum + entry.debit, 0), "BDT")}</strong></article>
    </section>
    {canCreateJournal ? <JournalForm accounts={data.accounts.filter((account) => account.is_active)}/> : null}
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Journal register</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-3">Entry</th><th>Date</th><th>Description</th><th>Status</th><th>Debit</th><th>Credit</th><th>Action</th></tr></thead><tbody>
        {data.entries.map((entry) => <tr key={entry.id} className="border-t"><td className="p-3 font-semibold">{entry.entry_number}</td><td>{entry.entry_date}</td><td>{entry.description}</td><td className="capitalize">{entry.status}</td><td>{money(entry.debit, entry.currency)}</td><td>{money(entry.credit, entry.currency)}</td><td>{entry.status === "draft" && canPost ? <form action={postJournalAction.bind(null, entry.id)}><button className="rounded border px-3 py-2 font-semibold">Post</button></form> : "—"}</td></tr>)}
      </tbody></table>{!data.entries.length ? <p className="p-8 text-center text-[var(--muted-text)]">No journal entries yet.</p> : null}</div>
    </section>
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Chart of accounts</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map((account) => <article key={account.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><strong>{account.code}</strong><span className="capitalize text-[var(--muted-text)]">{account.account_type}</span></div><p className="mt-1">{account.name}</p></article>)}</div></section></> : null}
  </DashboardShell>;
}
