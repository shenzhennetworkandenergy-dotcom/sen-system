import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { cargoLabel, getCargoJobs, getCargoSearchSuggestions } from "@/lib/cargo-tracking/data";

export const dynamic = "force-dynamic";

export default async function CargoTrackingPage({ searchParams }: { searchParams: Promise<{ tracking?: string; customer?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const params = await searchParams;
  const [jobs, suggestions] = await Promise.all([
    getCargoJobs({ tracking: params.tracking, customer: params.customer }),
    getCargoSearchSuggestions(),
  ]);
  return <DashboardShell admin title="Cargo Tracking" subtitle="China to Bangladesh service cargo, packages and operational history.">
    <div className="mb-4 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <form className="space-y-1"><label htmlFor="tracking-search" className="block text-sm font-bold">Tracking Number Search</label><div className="flex gap-2"><input id="tracking-search" name="tracking" list="cargo-tracking-suggestions" defaultValue={params.tracking} placeholder="Enter any part of tracking number" autoComplete="off" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg border px-4 py-2 font-semibold">Search</button></div><datalist id="cargo-tracking-suggestions">{suggestions.tracking.map((job) => <option key={job.id} value={job.courier_tracking_number} label={job.customer?.full_name || job.customer?.company_name || job.customer?.email || "Customer"} />)}</datalist></form>
      <form className="space-y-1"><label htmlFor="customer-search" className="block text-sm font-bold">Customer Search</label><div className="flex gap-2"><input id="customer-search" name="customer" list="cargo-customer-suggestions" defaultValue={params.customer} placeholder="Enter any part of customer name" autoComplete="off" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg border px-4 py-2 font-semibold">Search</button></div><datalist id="cargo-customer-suggestions">{suggestions.customers.map((customer) => <option key={customer.id} value={customer.full_name || customer.company_name || customer.email} label={customer.company_name || customer.email} />)}</datalist></form>
      <Link href="/admin/cargo-tracking/new" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-center font-semibold text-[var(--primary-foreground)]">Create Cargo Job</Link>
    </div>
    <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
      <table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">Tracking number</th><th>Customer</th><th>Goods</th><th>Method</th><th>Status</th><th>Created / Updated</th><th /></tr></thead><tbody>
        {jobs.map((job) => <tr key={job.id} className="border-t"><td className="p-3 font-bold">{job.courier_tracking_number}</td><td>{job.customer?.full_name || job.customer?.company_name || job.customer?.email}</td><td className="max-w-72 truncate">{job.goods_summary}</td><td>{cargoLabel(job.shipping_method)}</td><td><span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-900">{cargoLabel(job.current_status)}</span></td><td><span className="block">{new Date(job.created_at).toLocaleDateString("en-GB")}</span><span className="text-xs text-[var(--muted-text)]">Updated {new Date(job.updated_at).toLocaleString("en-GB")}</span></td><td><Link href={`/admin/cargo-tracking/${job.id}`} className="font-semibold text-blue-700">Open →</Link></td></tr>)}
      </tbody></table>
      {!jobs.length ? <p className="p-10 text-center text-[var(--muted-text)]">No cargo jobs found.</p> : null}
    </div>
  </DashboardShell>;
}
