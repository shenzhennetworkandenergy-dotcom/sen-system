import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getRmbActiveRates, getRmbPaymentWorkspace, getRmbSetupOptions, rmbStatusLabels } from "@/lib/rmb-payments/data";
import { setRmbActiveRateAction } from "./actions";

export const dynamic = "force-dynamic";

function money(value: number, digits = 2) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default async function RmbPaymentsPage() {
  await connection();
  await requireProfile(["admin"]);
  const jobs = await getRmbPaymentWorkspace();
  const [{ currencies }, rates] = await Promise.all([getRmbSetupOptions(), getRmbActiveRates()]);

  return <DashboardShell admin title="RMB / China Payment Service" subtitle="Operational foreign-currency payment-service records. No accounting posting is created.">
    <section className="mb-5 rounded-xl border bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-lg font-bold">Active RMB rates</h2><p className="text-sm text-[var(--muted-text)]">Set the read-only customer rate. Existing jobs keep their applied snapshot.</p></div>
        <form action={setRmbActiveRateAction} className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">Currency<select name="currency_code" required className="mt-1 block rounded-lg border px-3 py-2">{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}</select></label>
          <label className="text-sm font-semibold">BDT rate<input name="rate_bdt" type="number" min="0.000001" step="0.000001" required className="mt-1 block rounded-lg border px-3 py-2" /></label>
          <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Save active rate</button>
        </form>
      </div>
      {rates.length ? <div className="mt-4 flex flex-wrap gap-2">{rates.map((rate) => <span key={rate.id} className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">{rate.currency_code}: {money(rate.rate_bdt, 6)} BDT</span>)}</div> : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Set a rate before accepting customer requests.</p>}
    </section>
    <div className="mb-4 flex justify-end">
      <Link href="/admin/rmb-payments/new" className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Create RMB Job</Link>
    </div>
    <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr>
          <th className="px-4 py-3">RMB Job Ref</th><th className="px-4 py-3">Customer</th>
          <th className="px-4 py-3">Currency</th><th className="px-4 py-3">Foreign Amount</th>
          <th className="px-4 py-3">Rate</th><th className="px-4 py-3">BDT Payable</th>
          <th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Open</th>
        </tr></thead>
        <tbody>
          {jobs.map((job) => <tr key={job.id} className="border-t">
            <td className="px-4 py-3 font-semibold">{job.job_reference}</td>
            <td className="px-4 py-3">{job.customer?.full_name || job.customer?.email || "—"}</td>
            <td className="px-4 py-3">{job.foreign_currency}</td>
            <td className="px-4 py-3">{money(job.foreign_amount, 4)}</td>
            <td className="px-4 py-3">{money(job.agreed_bdt_rate, 6)}</td>
            <td className="px-4 py-3 font-semibold">BDT {money(job.calculated_bdt_payable)}</td>
            <td className="px-4 py-3">{rmbStatusLabels[job.current_status]}</td>
            <td className="px-4 py-3">{new Date(job.updated_at).toLocaleString("en-GB")}</td>
            <td className="px-4 py-3"><Link href={`/admin/rmb-payments/${job.id}`} className="font-semibold text-blue-700">Open →</Link></td>
          </tr>)}
          {!jobs.length ? <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--muted)]">No RMB payment jobs yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </DashboardShell>;
}
