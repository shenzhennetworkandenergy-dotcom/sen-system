import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getCustomerCargoJobs, cargoLabel } from "@/lib/cargo-tracking/data";

export const dynamic = "force-dynamic";

export default async function CustomerCargoPage() {
  await connection();
  const { profile } = await requireProfile(["customer"]);
  const jobs = await getCustomerCargoJobs(profile.id);
  return <DashboardShell title="My Cargo" subtitle="Create and track your own Cargo requests.">
    <div className="mb-5 flex justify-end"><Link href="/account/cargo/new" className="rounded-xl bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)]">Create Cargo Request</Link></div>
    <div className="overflow-x-auto rounded-2xl border bg-[var(--surface)]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-4">Cargo Reference</th><th className="p-4">Tracking</th><th className="p-4">Method</th><th className="p-4">Status</th><th className="p-4">Invoice</th><th className="p-4" /></tr></thead><tbody>{jobs.map((job) => { const invoice = Array.isArray(job.cargo_invoices) ? job.cargo_invoices[0] : job.cargo_invoices; return <tr key={job.id} className="border-t"><td className="p-4 font-bold">{job.internal_cargo_id}</td><td className="p-4">{job.courier_tracking_number}</td><td className="p-4">{job.shipping_method}</td><td className="p-4">{cargoLabel(job.current_status)}</td><td className="p-4">{invoice?.customer_visible ? `${invoice.payment_status} · ${invoice.invoice_number}` : "Not available"}</td><td className="p-4 text-right"><Link href={`/account/cargo/${job.id}`} className="rounded-lg border px-3 py-2 font-bold">Open</Link></td></tr>; })}</tbody></table>{!jobs.length ? <p className="p-10 text-center">No Cargo requests yet.</p> : null}</div>
  </DashboardShell>;
}
