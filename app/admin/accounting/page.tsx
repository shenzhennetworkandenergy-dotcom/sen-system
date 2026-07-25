import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { JournalForm } from "@/components/accounting/JournalForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getAccountingDashboard } from "@/lib/accounting/data";
import { postJournalAction } from "./actions";

export const dynamic = "force-dynamic";
const money = (value: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).format(value);

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("accounting.view");
  const params = await searchParams;
  const data = await getAccountingDashboard();
  const canCreate = profile.role === "admin" || permissions.has("accounting.create_entry");
  const canPost = profile.role === "admin" || permissions.has("accounting.approve_entry");
  const posted = data.entries.filter((entry) => entry.status === "posted");
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Accounting" subtitle="Chart of accounts, balanced journals and an auditable general-ledger foundation.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <section className="mb-6 grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Active accounts</p><strong className="mt-2 block text-3xl">{data.accounts.filter((account) => account.is_active).length}</strong></article>
      <article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Posted journals</p><strong className="mt-2 block text-3xl">{posted.length}</strong></article>
      <article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Posted value</p><strong className="mt-2 block text-2xl">{money(posted.reduce((sum, entry) => sum + entry.debit, 0), "BDT")}</strong></article>
    </section>
    {canCreate ? <JournalForm accounts={data.accounts.filter((account) => account.is_active)}/> : null}
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Journal register</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-3">Entry</th><th>Date</th><th>Description</th><th>Status</th><th>Debit</th><th>Credit</th><th>Action</th></tr></thead><tbody>
        {data.entries.map((entry) => <tr key={entry.id} className="border-t"><td className="p-3 font-semibold">{entry.entry_number}</td><td>{entry.entry_date}</td><td>{entry.description}</td><td className="capitalize">{entry.status}</td><td>{money(entry.debit, entry.currency)}</td><td>{money(entry.credit, entry.currency)}</td><td>{entry.status === "draft" && canPost ? <form action={postJournalAction.bind(null, entry.id)}><button className="rounded border px-3 py-2 font-semibold">Post</button></form> : "—"}</td></tr>)}
      </tbody></table>{!data.entries.length ? <p className="p-8 text-center text-[var(--muted-text)]">No journal entries yet.</p> : null}</div>
    </section>
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Chart of accounts</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map((account) => <article key={account.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><strong>{account.code}</strong><span className="capitalize text-[var(--muted-text)]">{account.account_type}</span></div><p className="mt-1">{account.name}</p></article>)}</div></section>
  </DashboardShell>;
}
