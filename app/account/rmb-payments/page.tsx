import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getRmbCustomerJobs, rmbStatusLabels } from "@/lib/rmb-payments/data";

export const dynamic = "force-dynamic";
const money = (value: number, digits = 2) => Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default async function CustomerRmbPaymentsPage() {
  await connection();
  const { profile } = await requireProfile(["customer"]);
  const jobs = await getRmbCustomerJobs(profile.id);
  return <DashboardShell title="My RMB Requests" subtitle="Create and follow your own RMB / China payment-service requests.">
    <div className="mb-4 flex justify-end"><Link href="/account/rmb-payments/new" className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Create RMB Request</Link></div>
    <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Applied rate</th><th className="px-4 py-3">BDT payable</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Open</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-t"><td className="px-4 py-3 font-semibold">{job.job_reference}</td><td className="px-4 py-3">{new Date(job.created_at).toLocaleDateString("en-GB")}</td><td className="px-4 py-3">{job.foreign_currency}</td><td className="px-4 py-3">{money(job.foreign_amount, 4)}</td><td className="px-4 py-3">{money(job.agreed_bdt_rate, 6)}</td><td className="px-4 py-3 font-semibold">BDT {money(job.calculated_bdt_payable)}</td><td className="px-4 py-3">{rmbStatusLabels[job.current_status]}</td><td className="px-4 py-3"><Link href={`/account/rmb-payments/${job.id}`} className="font-semibold text-blue-700">Open →</Link></td></tr>)}{!jobs.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--muted)]">No RMB requests yet.</td></tr> : null}</tbody></table></div>
  </DashboardShell>;
}
