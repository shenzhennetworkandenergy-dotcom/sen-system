import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getDonationDashboard } from "@/lib/donation-expenses/data";
import { addDonationCategoryAction, addDonationPaymentMethodAction, skipDonationReminderAction } from "./actions";
import { DonationExpenseForm } from "./DonationExpenseForm";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export default async function DonationExpensesPage({ searchParams }: { searchParams: Promise<{ search?: string; beneficiary?: string; reminder?: string; success?: string; error?: string }> }) {
  await connection(); await requireProfile(["admin"]);
  const params = await searchParams;
  const workspace = await getDonationDashboard(params.search);
  const reminder = params.reminder ? workspace.reminders.find((item) => item.id === params.reminder) : undefined;
  return <DashboardShell admin title="Donations & Charity Expenses" subtitle="Independent operational records for non-recoverable support, with no financial posting.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}

    <section className="mb-6 rounded-xl border bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{workspace.reminders.length} Monthly Support Due</h2><p className="text-sm text-[var(--muted-text)]">Pending reminders due this month.</p></div><Link href="/admin/donation-expenses/beneficiaries" className="rounded-lg border px-4 py-2 font-semibold">Beneficiaries</Link></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {workspace.reminders.map((item) => <article key={item.id} className="rounded-lg border p-4">
          <strong>{item.beneficiary?.name}</strong><p className="text-sm text-[var(--muted-text)]">{item.beneficiary?.beneficiary_reference} · {money(Number(item.amount))} · Day {item.reminder_day_of_month}</p>
          <p className="mt-1 text-sm">{item.purpose || "Regular monthly support"}</p>
          <div className="mt-3 flex gap-2"><Link href={`/admin/donation-expenses?beneficiary=${item.beneficiary_id}&reminder=${item.id}#create-donation`} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)]">Create Payment</Link><form action={skipDonationReminderAction.bind(null, item.id)}><button className="rounded-lg border px-3 py-2 text-sm font-semibold">Skip</button></form></div>
        </article>)}
        {!workspace.reminders.length ? <p className="text-sm text-[var(--muted-text)]">No monthly support is due today.</p> : null}
      </div>
    </section>

    <section className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl border bg-[var(--surface)] p-5" id="create-donation"><h2 className="mb-4 text-xl font-semibold">Create Donation Expense</h2><DonationExpenseForm key={reminder?.id ?? params.beneficiary ?? "new"} beneficiaries={workspace.beneficiaries} categories={workspace.categories} paymentMethods={workspace.paymentMethods} selectedBeneficiaryId={params.beneficiary} reminder={reminder} /></div>
      <div className="space-y-5">
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="font-semibold">Find Beneficiary</h2><form className="mt-3 flex gap-2"><input name="search" defaultValue={params.search} placeholder="Name, phone or reference" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2" /><button className="rounded-lg border px-3 py-2 font-semibold">Search</button></form>{workspace.matchedBeneficiaries.map((item) => <Link key={item.id} href={`/admin/donation-expenses/beneficiaries/${item.id}`} className="mt-2 block rounded-lg border p-3"><strong>{item.name}</strong><span className="block text-xs text-[var(--muted-text)]">{item.beneficiary_reference} · {item.phone || "No phone"}</span></Link>)}</div>
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="font-semibold">Add Category</h2><form action={addDonationCategoryAction} className="mt-3 flex gap-2"><input name="name" required className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2" /><button className="rounded-lg border px-3 py-2 font-semibold">Add</button></form></div>
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="font-semibold">Add Payment Method</h2><form action={addDonationPaymentMethodAction} className="mt-3 flex gap-2"><input name="name" required className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2" /><button className="rounded-lg border px-3 py-2 font-semibold">Add</button></form></div>
      </div>
    </section>

    <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="mb-4 text-xl font-semibold">Recent Donation Expenses</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Reference</th><th className="p-2">Beneficiary</th><th className="p-2">Date</th><th className="p-2">Category</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Open</th></tr></thead><tbody>{workspace.expenses.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-2 font-medium">{item.expense_reference}</td><td className="p-2">{item.beneficiary?.name}</td><td className="p-2">{date(item.donation_date)}</td><td className="p-2">{item.category?.name}</td><td className="p-2">{money(Number(item.amount))}</td><td className="p-2">{item.status}</td><td className="p-2"><Link href={`/admin/donation-expenses/${item.id}`} className="font-semibold text-[var(--primary)]">Open</Link></td></tr>)}</tbody></table></div>{!workspace.expenses.length ? <p className="py-6 text-center text-[var(--muted-text)]">No donation expenses yet.</p> : null}</section>
  </DashboardShell>;
}
