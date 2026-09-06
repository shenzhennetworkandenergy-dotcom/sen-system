import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getRmbPaymentWorkspace, rmbStatusLabels } from "@/lib/rmb-payments/data";

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

  return <DashboardShell admin title="RMB / China Payment Service" subtitle="Operational foreign-currency payment-service records. No accounting posting is created.">
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
