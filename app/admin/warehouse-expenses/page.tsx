import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getWarehouseExpenseWorkspace } from "@/lib/warehouse-expenses/data";
import { saveWarehouseExpenseVoucherAction } from "./actions";
import { VoucherForm } from "./VoucherForm";

export const dynamic = "force-dynamic";

export default async function WarehouseExpensesPage({ searchParams }: { searchParams: Promise<{ edit?: string; success?: string; error?: string }> }) {
  await connection();
  const { profile } = await requireProfile(["admin"]);
  const params = await searchParams;
  const { template, vouchers, editing } = await getWarehouseExpenseWorkspace(params.edit);
  return <DashboardShell admin title="Warehouse Expenses" subtitle="Create, save and reprint monthly warehouse expense vouchers without financial posting.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-3">
        {vouchers.map((voucher) => <article key={voucher.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-[var(--surface)] p-4">
          <div><strong>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${voucher.voucher_month}T00:00:00Z`))}</strong><p className="text-sm text-[var(--muted-text)]">{voucher.warehouses?.name} · BDT {Number(voucher.total_amount).toLocaleString("en-BD", { minimumFractionDigits: 2 })} · <span className="capitalize">{voucher.status}</span></p></div>
          <div className="flex gap-2"><Link href={`/admin/warehouse-expenses?edit=${voucher.id}`} className="rounded-lg border px-3 py-2 font-semibold">Edit</Link><Link href={`/admin/warehouse-expenses/${voucher.id}/print`} className="rounded-lg bg-[var(--primary)] px-3 py-2 font-semibold text-[var(--primary-foreground)]">Print voucher</Link></div>
        </article>)}
        {!vouchers.length ? <p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">No monthly warehouse expense vouchers yet.</p> : null}
      </div>
      <form action={saveWarehouseExpenseVoucherAction} className="h-fit rounded-xl border bg-[var(--surface)] p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{editing ? "Edit monthly voucher" : "Generate monthly voucher"}</h2>{editing ? <Link href="/admin/warehouse-expenses" className="text-sm font-semibold text-blue-700">Cancel edit</Link> : null}</div>
        {template ? <VoucherForm template={template} editing={editing} previous={vouchers.find((row) => row.id !== editing?.id) ?? null} /> : <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">The active Dhaka warehouse template is not available.</p>}
        {template ? <button className="mt-4 w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)]">Save voucher</button> : null}
      </form>
    </section>
    <p className="mt-4 text-xs text-[var(--muted-text)]">Signed in as {profile.full_name || profile.email}. Saving a voucher does not post to Accounting or Cashbook.</p>
  </DashboardShell>;
}
