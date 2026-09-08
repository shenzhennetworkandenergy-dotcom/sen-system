import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { isAdmin, requirePermission } from "@/lib/auth/permissions";
import { cargoLabel, getCargoJobs, getCargoRates, getCargoSearchSuggestions } from "@/lib/cargo-tracking/data";
import { setCargoActiveRateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CargoTrackingPage({ searchParams }: { searchParams: Promise<{ tracking?: string; customer?: string; cargoId?: string; success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("cargo.view");
  const admin = isAdmin(profile);
  const canCreate = admin || permissions.has("cargo.create");
  const params = await searchParams;
  const [jobs, suggestions, rates] = await Promise.all([
    getCargoJobs({ tracking: params.tracking, customer: params.customer, cargoId: params.cargoId }),
    getCargoSearchSuggestions(),
    getCargoRates(),
  ]);
  return <DashboardShell admin={admin} employeePermissions={admin ? undefined : permissions} title="Cargo Tracking" subtitle="China to Bangladesh service cargo, packages and operational history.">
    {params.success ? <p className="mb-4 rounded-lg bg-green-50 p-3 text-green-900">{params.success}</p> : null}{params.error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    {admin ? <section className="mb-4 rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Cargo billing rates</h2><form action={setCargoActiveRateAction} className="mt-3 flex flex-wrap items-end gap-3"><label className="font-semibold">Method<select name="shipping_method" className="mt-1 block rounded-lg border px-3 py-2"><option value="air">Air</option><option value="sea">Sea</option><option value="hand_carry">Hand carry</option></select></label><label className="font-semibold">BDT per kg<input name="rate_bdt_per_kg" type="number" min="0.0001" step="0.0001" required className="mt-1 block rounded-lg border px-3 py-2" /></label><button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">Save Active Rate</button></form><div className="mt-3 flex flex-wrap gap-2 text-sm">{rates.filter((rate) => rate.is_active).map((rate) => <span key={rate.id} className="rounded-full bg-blue-50 px-3 py-1">{rate.shipping_method}: {rate.rate_bdt_per_kg} BDT/kg</span>)}</div></section> : null}
    <div className="mb-4 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
      <form className="space-y-1"><label htmlFor="tracking-search" className="block text-sm font-bold">Tracking Number Search</label><div className="flex gap-2"><input id="tracking-search" name="tracking" list="cargo-tracking-suggestions" defaultValue={params.tracking} placeholder="Enter any part of tracking number" autoComplete="off" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg border px-4 py-2 font-semibold">Search</button></div><datalist id="cargo-tracking-suggestions">{suggestions.tracking.map((job) => <option key={job.id} value={job.courier_tracking_number} label={job.customer?.full_name || job.customer?.company_name || job.customer?.email || "Customer"} />)}</datalist></form>
      <form className="space-y-1"><label htmlFor="customer-search" className="block text-sm font-bold">Customer Search</label><div className="flex gap-2"><input id="customer-search" name="customer" list="cargo-customer-suggestions" defaultValue={params.customer} placeholder="Enter any part of customer name" autoComplete="off" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg border px-4 py-2 font-semibold">Search</button></div><datalist id="cargo-customer-suggestions">{suggestions.customers.map((customer) => <option key={customer.id} value={customer.full_name || customer.company_name || customer.email} label={customer.company_name || customer.email} />)}</datalist></form>
      <form className="space-y-1"><label htmlFor="cargo-id-search" className="block text-sm font-bold">Cargo / Package ID Search</label><div className="flex gap-2"><input id="cargo-id-search" name="cargoId" defaultValue={params.cargoId} placeholder="Internal Cargo ID or Package ID" autoComplete="off" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg border px-4 py-2 font-semibold">Search</button></div></form>
      {canCreate ? <Link href="/admin/cargo-tracking/new" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-center font-semibold text-[var(--primary-foreground)]">Create Cargo Job</Link> : <span />}
    </div>
    <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
      <table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">Cargo ID</th><th>Tracking number</th><th>Customer</th><th>Goods</th><th>Method</th><th>Carrier</th><th>Status</th><th>Created / Updated</th><th /></tr></thead><tbody>
        {jobs.map((job) => <tr key={job.id} className="border-t"><td className="p-3 font-bold text-blue-900">{job.internal_cargo_id}</td><td className="font-bold">{job.courier_tracking_number}</td><td>{job.customer?.full_name || job.customer?.company_name || job.customer?.email}</td><td className="max-w-72 truncate">{job.goods_summary}</td><td>{cargoLabel(job.shipping_method)}</td><td>{job.carrier?.name || "—"}</td><td><span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-900">{cargoLabel(job.current_status)}</span></td><td><span className="block">{new Date(job.created_at).toLocaleDateString("en-GB")}</span><span className="text-xs text-[var(--muted-text)]">Updated {new Date(job.updated_at).toLocaleString("en-GB")}</span></td><td><Link href={`/admin/cargo-tracking/${job.id}`} className="font-semibold text-blue-700">Open →</Link></td></tr>)}
      </tbody></table>
      {!jobs.length ? <p className="p-10 text-center text-[var(--muted-text)]">No cargo jobs found.</p> : null}
    </div>
  </DashboardShell>;
}
