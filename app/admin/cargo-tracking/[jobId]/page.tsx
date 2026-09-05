import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { cargoLabel, getCargoJob, nextCargoStatus, type CargoStatus } from "@/lib/cargo-tracking/data";
import {
  advanceCargoStatusAction,
  assignCargoPackageLocationAction,
  verifyCargoHandoverAction,
  verifyCargoPackageChinaReceiveAction,
  verifyCargoPackageReadyAction,
} from "../actions";
import { WarehouseLocationFields } from "../new/CargoJobForm";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-lg border bg-white px-3 py-2";

export default async function CargoJobPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const { jobId } = await params;
  const notice = await searchParams;
  const data = await getCargoJob(jobId);
  if (!data) notFound();
  const { job, packages, events, bangladeshWarehouses, locations } = data;
  const nextStatus = nextCargoStatus(job.current_status as CargoStatus);
  const customer = job.customer as { full_name: string | null; company_name: string | null; email: string; phone: string | null } | null;
  const action = advanceCargoStatusAction.bind(null, jobId);
  const packageLocationStatuses = ["arrived_bangladesh", "received_bd_warehouse", "ready_for_customer"];
  const packageReadyStatuses = ["received_bd_warehouse", "ready_for_customer"];
  const packageLocations = locations.filter((location) => location.warehouse_id === job.bangladesh_warehouse_id);
  return <DashboardShell admin title={job.internal_cargo_id} subtitle={`Courier tracking: ${job.courier_tracking_number}`}>
    {notice.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{notice.success}</p> : null}
    {notice.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{notice.error}</p> : null}
    <div className="mb-4 flex items-center justify-between"><Link href="/admin/cargo-tracking" className="font-semibold text-blue-700">← Cargo jobs</Link><span className="rounded-full bg-blue-100 px-3 py-1 font-bold text-blue-950">{cargoLabel(job.current_status)}</span></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-5">
        <section className="grid gap-4 rounded-xl border bg-[var(--surface)] p-5 md:grid-cols-2"><div><h2 className="font-bold">Internal Cargo ID</h2><p className="text-lg font-black text-blue-900">{job.internal_cargo_id}</p><p className="text-sm text-[var(--muted-text)]">Tracking: {job.courier_tracking_number}</p></div><div><h2 className="font-bold">Customer</h2><p>{customer?.full_name || customer?.company_name || customer?.email}</p><p className="text-sm text-[var(--muted-text)]">{customer?.company_name}<br />{customer?.email}<br />{customer?.phone}</p></div><div><h2 className="font-bold">Service</h2><p>{cargoLabel(job.shipping_method)} · {cargoLabel(job.charge_basis)} · Rate {Number(job.rate).toLocaleString()}</p><p className="text-sm text-[var(--muted-text)]">{job.goods_summary}</p></div><div><h2 className="font-bold">Carrier / Transport Provider</h2><p>{job.carrier?.name || "—"}</p>{job.carrier_reference ? <p className="text-sm text-[var(--muted-text)]">Reference: {job.carrier_reference}</p> : null}</div><div><h2 className="font-bold">China warehouse</h2><p>{job.chinaWarehouse?.name || "Not assigned"}</p></div><div><h2 className="font-bold">Bangladesh destination</h2><p>{job.bangladeshWarehouse?.name || "Not assigned"}{job.bangladeshLocation ? ` · ${job.bangladeshLocation.code} ${job.bangladeshLocation.name}` : ""}</p></div><div><h2 className="font-bold">Handover verification</h2><p>{job.handover_verified_at ? `Verified ${new Date(job.handover_verified_at).toLocaleString("en-GB")}` : "Not handed over"}</p>{job.handover_recipient ? <p className="text-sm text-[var(--muted-text)]">Recipient: {job.handover_recipient}{job.handover_reference ? ` · ${job.handover_reference}` : ""}</p> : null}</div>{job.note ? <p className="md:col-span-2"><strong>Note:</strong> {job.note}</p> : null}</section>
        <section className="rounded-xl border bg-[var(--surface)]"><h2 className="p-4 text-lg font-bold">Packages ({packages.length})</h2><div className="space-y-4 border-t p-4">{packages.map((item) => {
          const chinaAction = verifyCargoPackageChinaReceiveAction.bind(null, jobId, item.id);
          const locationAction = assignCargoPackageLocationAction.bind(null, jobId, item.id);
          const readyAction = verifyCargoPackageReadyAction.bind(null, jobId, item.id);
          return <article key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-blue-900">{item.package_identifier}</p><p className="font-semibold">{item.description}</p><p className="text-sm text-[var(--muted-text)]">{item.quantity} {item.unit} · Weight {item.weight ?? "—"} kg · CBM {item.cbm ?? "—"}{item.dimensions ? ` · ${item.dimensions}` : ""}</p></div><Link href={`/admin/cargo-tracking/${jobId}/packages/${item.id}/label`} className="rounded-lg border px-3 py-2 text-sm font-bold">Print Label</Link></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><p className={item.china_received_at ? "text-green-700" : "text-amber-700"}><strong>China:</strong> {item.china_received_at ? `Received ${new Date(item.china_received_at).toLocaleString("en-GB")}` : "Not verified"}</p><p><strong>Location:</strong> {item.warehouseLocation ? `${item.warehouseLocation.code} ${item.warehouseLocation.name}` : "Not assigned"}</p><p className={item.handed_over_at ? "text-green-700" : item.ready_verified_at ? "text-blue-700" : "text-amber-700"}><strong>Customer:</strong> {item.handed_over_at ? "Handed over" : item.ready_verified_at ? "Ready verified" : "Not ready"}</p></div>
            <div className="mt-3 flex flex-wrap gap-2">{!item.china_received_at && ["expected_china", "received_china"].includes(job.current_status) ? <form action={chinaAction}><button className="rounded-lg border px-3 py-2 text-sm font-bold">China Receive</button></form> : null}{!item.handed_over_at && packageLocationStatuses.includes(job.current_status) && job.bangladesh_warehouse_id ? <form action={locationAction} className="flex flex-wrap gap-2"><select name="location_id" required defaultValue={item.warehouse_location_id ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Assign BD location</option>{packageLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select><button className="rounded-lg border px-3 py-2 text-sm font-bold">Save Location</button></form> : null}{!item.ready_verified_at && item.china_received_at && item.warehouse_location_id && packageReadyStatuses.includes(job.current_status) ? <form action={readyAction}><button className="rounded-lg border border-green-600 px-3 py-2 text-sm font-bold text-green-800">Mark Ready</button></form> : null}</div>
          </article>;
        })}</div></section>
        <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="mb-4 text-lg font-bold">Status history</h2><div className="space-y-3">{events.map((event) => <article key={event.id} className="border-l-4 border-blue-500 pl-4"><div className="flex flex-wrap justify-between gap-2"><strong>{cargoLabel(event.status)}</strong><time className="text-sm text-[var(--muted-text)]">{new Date(event.event_at).toLocaleString("en-GB")}</time></div><p className="text-sm">{event.note || "Status updated."}</p><p className="text-xs text-[var(--muted-text)]">{event.warehouse?.name || "No warehouse"}{event.location ? ` · ${event.location.code} ${event.location.name}` : ""} · {event.actor?.full_name || event.actor?.email}</p></article>)}</div></section>
      </div>
      <section className="h-fit rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Operational update</h2>{nextStatus === "handed_over" ? <form action={verifyCargoHandoverAction.bind(null, jobId)} className="mt-4 space-y-3"><p className="rounded-lg bg-blue-50 p-3 text-sm">All packages must be ready. Handover can be verified only once.</p><label className="block font-semibold">Recipient<input name="recipient" required maxLength={200} className={field} /></label><label className="block font-semibold">Reference<input name="reference" maxLength={200} className={field} /></label><label className="block font-semibold">Handover date/time<input name="event_at" type="datetime-local" className={field} /></label><button className="w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)]">Verify Handover</button></form> : nextStatus ? <form action={action} className="mt-4 space-y-3"><input type="hidden" name="status" value={nextStatus} /><p className="rounded-lg bg-blue-50 p-3 text-sm">Next status: <strong>{cargoLabel(nextStatus)}</strong></p><label className="block font-semibold">Event date/time<input name="event_at" type="datetime-local" className={field} /></label>{nextStatus === "received_bd_warehouse" ? <WarehouseLocationFields warehouses={bangladeshWarehouses} locations={locations} initialWarehouseId={job.bangladesh_warehouse_id ?? ""} initialLocationId={job.bangladesh_location_id ?? ""} /> : null}<label className="block font-semibold">Event note<textarea name="note" maxLength={2000} rows={3} className={field} /></label><button className="w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)]">Mark {cargoLabel(nextStatus)}</button></form> : <p className="mt-4 rounded-lg bg-green-50 p-4 font-semibold text-green-900">This cargo job is closed.</p>}</section>
    </div>
  </DashboardShell>;
}
