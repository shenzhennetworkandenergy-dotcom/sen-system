import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { cargoLabel, getCargoJob, nextCargoStatus, type CargoStatus } from "@/lib/cargo-tracking/data";
import { advanceCargoStatusAction } from "../actions";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-lg border bg-white px-3 py-2";

export default async function CargoJobPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const { jobId } = await params;
  const notice = await searchParams;
  const data = await getCargoJob(jobId);
  if (!data) notFound();
  const { job, packages, events, warehouses, locations } = data;
  const nextStatus = nextCargoStatus(job.current_status as CargoStatus);
  const customer = job.customer as { full_name: string | null; company_name: string | null; email: string; phone: string | null } | null;
  const action = advanceCargoStatusAction.bind(null, jobId);
  return <DashboardShell admin title={job.courier_tracking_number} subtitle="Cargo job details and immutable operational history.">
    {notice.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{notice.success}</p> : null}
    {notice.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{notice.error}</p> : null}
    <div className="mb-4 flex items-center justify-between"><Link href="/admin/cargo-tracking" className="font-semibold text-blue-700">← Cargo jobs</Link><span className="rounded-full bg-blue-100 px-3 py-1 font-bold text-blue-950">{cargoLabel(job.current_status)}</span></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-5">
        <section className="grid gap-4 rounded-xl border bg-[var(--surface)] p-5 md:grid-cols-2"><div><h2 className="font-bold">Customer</h2><p>{customer?.full_name || customer?.company_name || customer?.email}</p><p className="text-sm text-[var(--muted-text)]">{customer?.company_name}<br />{customer?.email}<br />{customer?.phone}</p></div><div><h2 className="font-bold">Service</h2><p>{cargoLabel(job.shipping_method)} · {cargoLabel(job.charge_basis)} · Rate {Number(job.rate).toLocaleString()}</p><p className="text-sm text-[var(--muted-text)]">{job.goods_summary}</p></div><div><h2 className="font-bold">Carrier / Transport Provider</h2><p>{job.carrier?.name || "—"}</p>{job.carrier_reference ? <p className="text-sm text-[var(--muted-text)]">Reference: {job.carrier_reference}</p> : null}</div><div><h2 className="font-bold">China warehouse</h2><p>{job.chinaWarehouse?.name || "Not assigned"}</p></div><div><h2 className="font-bold">Bangladesh destination</h2><p>{job.bangladeshWarehouse?.name || "Not assigned"}{job.bangladeshLocation ? ` · ${job.bangladeshLocation.code} ${job.bangladeshLocation.name}` : ""}</p></div>{job.note ? <p className="md:col-span-2"><strong>Note:</strong> {job.note}</p> : null}</section>
        <section className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><h2 className="p-4 text-lg font-bold">Packages ({packages.length})</h2><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">#</th><th>Description</th><th>Quantity</th><th>Weight</th><th>Dimensions</th><th>CBM</th></tr></thead><tbody>{packages.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.sequence_number}</td><td>{item.description}</td><td>{item.quantity} {item.unit}</td><td>{item.weight ?? "—"}</td><td>{item.dimensions || "—"}</td><td>{item.cbm ?? "—"}</td></tr>)}</tbody></table></section>
        <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="mb-4 text-lg font-bold">Status history</h2><div className="space-y-3">{events.map((event) => <article key={event.id} className="border-l-4 border-blue-500 pl-4"><div className="flex flex-wrap justify-between gap-2"><strong>{cargoLabel(event.status)}</strong><time className="text-sm text-[var(--muted-text)]">{new Date(event.event_at).toLocaleString("en-GB")}</time></div><p className="text-sm">{event.note || "Status updated."}</p><p className="text-xs text-[var(--muted-text)]">{event.warehouse?.name || "No warehouse"}{event.location ? ` · ${event.location.code} ${event.location.name}` : ""} · {event.actor?.full_name || event.actor?.email}</p></article>)}</div></section>
      </div>
      <section className="h-fit rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Operational update</h2>{nextStatus ? <form action={action} className="mt-4 space-y-3"><input type="hidden" name="status" value={nextStatus} /><p className="rounded-lg bg-blue-50 p-3 text-sm">Next status: <strong>{cargoLabel(nextStatus)}</strong></p><label className="block font-semibold">Event date/time<input name="event_at" type="datetime-local" className={field} /></label>{nextStatus === "received_bd_warehouse" ? <><label className="block font-semibold">Bangladesh warehouse<select name="warehouse_id" required defaultValue={job.bangladesh_warehouse_id ?? ""} className={field}><option value="">Select warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label><label className="block font-semibold">Warehouse/rack location<select name="location_id" defaultValue={job.bangladesh_location_id ?? ""} className={field}><option value="">No location</option>{locations.map((location) => { const warehouse = warehouses.find((item) => item.id === location.warehouse_id); return <option key={location.id} value={location.id}>{warehouse?.name || "Warehouse"} · {location.code} {location.name}</option>; })}</select></label></> : null}<label className="block font-semibold">Event note<textarea name="note" maxLength={2000} rows={3} className={field} /></label><button className="w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)]">Mark {cargoLabel(nextStatus)}</button></form> : <p className="mt-4 rounded-lg bg-green-50 p-4 font-semibold text-green-900">This cargo job is closed.</p>}</section>
    </div>
  </DashboardShell>;
}
