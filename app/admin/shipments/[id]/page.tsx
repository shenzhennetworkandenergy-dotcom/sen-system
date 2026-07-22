import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ShipmentTrackingCard } from "@/components/orders/ShipmentTrackingCard";
import { requirePermission } from "@/lib/auth/permissions";
import { getShipment } from "@/lib/orders/data";
import { dateTime, label, type RoutePoint } from "@/lib/orders/types";
import { addTrackingEventAction, confirmShipmentAction, dispatchShipmentAction, linkShipmentDocumentAction, markDeliveredAction } from "@/app/admin/shipments/actions";

export const dynamic = "force-dynamic";

export default async function ShipmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("shipments.view");
  const { id } = await params;
  const notice = await searchParams;
  const data = await getShipment(id);
  if (!data) notFound();
  const { shipment, items, serials, events, points, statuses, workplaces, documents, availableDocuments } = data;
  const order = shipment.sales_orders as unknown as { id: string; order_number: string };
  const can = (key: string) => profile.role === "admin" || permissions.has(key);

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={shipment.shipment_number} subtitle={`Order ${order.order_number} · ${label(shipment.transport_mode)} fulfilment`}>
    {notice.success ? <p className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">{notice.success}</p> : null}
    {notice.error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{notice.error}</p> : null}
    <div className="mb-5 flex flex-wrap gap-3">
      <a href={`/admin/orders/${order.id}`} className="rounded-xl border px-4 py-2.5 font-semibold">Open order</a>
      {shipment.status === "draft" && can("shipments.edit") ? <form action={confirmShipmentAction.bind(null, id)}><button className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Confirm shipment</button></form> : null}
      {["confirmed", "ready"].includes(shipment.status) && can("shipments.confirm_dispatch") ? <form action={dispatchShipmentAction.bind(null, id)}><button className="rounded-xl bg-orange-600 px-4 py-2.5 font-semibold text-white">Validate and dispatch</button></form> : null}
      {["dispatched", "in_transit", "arrived", "out_for_delivery"].includes(shipment.status) && can("shipments.confirm_receipt") ? <form action={markDeliveredAction.bind(null, id)} className="flex gap-2"><input name="note" placeholder="Customer delivery note" className="rounded-xl border px-3"/><button className="rounded-xl bg-green-700 px-4 py-2.5 font-semibold text-white">Mark delivered</button></form> : null}
    </div>
    <ShipmentTrackingCard shipment={shipment} events={events as never[]} points={points as RoutePoint[]} internal/>

    <section className="mt-6 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <div className="rounded-2xl border bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Shipment contents</h2>
        <div className="mt-4 space-y-3">{items.map((item) => {
          const orderItem = item.sales_order_items as unknown as { product_name_snapshot: string; sku_snapshot: string };
          const assigned = serials.filter((serial) => serial.shipment_item_id === item.id);
          return <article key={item.id} className="rounded-xl border p-4"><b>{orderItem.product_name_snapshot}</b><p className="text-sm text-[var(--muted-text)]">{orderItem.sku_snapshot} · Quantity {item.quantity}</p>{assigned.map((entry) => { const serial = entry.serial_numbers as unknown as { sen_serial: string; manufacturer_serial: string | null }; return <p key={entry.allocation_id} className="mt-2 rounded bg-[var(--muted-surface)] p-2 text-sm">{serial.sen_serial}{serial.manufacturer_serial ? ` · ${serial.manufacturer_serial}` : ""}</p>; })}</article>;
        })}</div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt>Estimated departure</dt><dd>{dateTime(shipment.estimated_departure_at)}</dd></div><div><dt>Estimated arrival</dt><dd>{dateTime(shipment.estimated_arrival_at)}</dd></div><div><dt>Actual departure</dt><dd>{dateTime(shipment.actual_departure_at)}</dd></div><div><dt>Actual arrival</dt><dd>{dateTime(shipment.actual_arrival_at)}</dd></div></dl>
      </div>
      {can("shipments.update_status") ? <form action={addTrackingEventAction.bind(null, id)} className="rounded-2xl border bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Add tracking update</h2><p className="mt-1 text-sm text-[var(--muted-text)]">Use a recorded workplace or manual checkpoint. This is operational tracking, not live GPS.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">Tracking status<select name="status_id" required className="mt-1 w-full rounded-xl border px-3 py-2.5">{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label><label className="text-sm font-semibold">Recorded workplace<select name="workplace_id" className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="">Manual checkpoint</option>{workplaces.map((place) => <option key={place.id} value={place.id}>{place.name} · {place.country_code}</option>)}</select></label><label className="text-sm font-semibold">Location label<input name="location_label" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Visibility<select name="visibility" defaultValue="both" className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="both">Customer and internal</option><option value="customer">Customer only</option><option value="internal">Internal only</option></select></label><label className="text-sm font-semibold">Latitude<input name="latitude" type="number" step="0.000001" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Longitude<input name="longitude" type="number" step="0.000001" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Occurred at<input name="occurred_at" type="datetime-local" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><input type="hidden" name="location_source" value="manual"/><label className="text-sm font-semibold">Customer title<input name="customer_title" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold md:col-span-2">Customer message<textarea name="customer_message" rows={3} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold md:col-span-2">Internal note<textarea name="internal_note" rows={3} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>
        <button className="mt-4 rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Record tracking event</button>
      </form> : null}
    </section>

    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5">
      <h2 className="text-lg font-semibold">Shipment documents</h2><p className="mt-1 text-sm text-[var(--muted-text)]">Only warranty documents and purchase invoices may be customer-visible.</p>
      <div className="mt-4 flex flex-wrap gap-2">{documents.map((document) => <span key={document.id} className="rounded-full border px-3 py-1 text-sm">{label(document.document_type)} · {label(document.visibility)}</span>)}{!documents.length ? <span className="text-sm text-[var(--muted-text)]">No documents linked.</span> : null}</div>
      {can("shipments.manage_documents") ? <form action={linkShipmentDocumentAction.bind(null, id, order.id)} className="mt-5 grid gap-3 md:grid-cols-3"><select name="product_media_id" required className="rounded-xl border px-3 py-2.5"><option value="">Select uploaded product document</option>{availableDocuments.map((document) => <option key={document.id} value={document.id}>{document.original_file_name || document.media_purpose || document.storage_path}</option>)}</select><select name="document_type" required className="rounded-xl border px-3 py-2.5"><option value="warranty_document">Warranty document</option><option value="purchase_invoice">Purchase invoice</option><option value="packing_list">Packing list</option><option value="customs_document">Customs document</option><option value="supplier_invoice">Supplier invoice</option><option value="other">Other</option></select><select name="visibility" defaultValue="internal" className="rounded-xl border px-3 py-2.5"><option value="internal">Internal only</option><option value="customer_order_restricted">Customer order restricted</option></select><button disabled={!availableDocuments.length} className="rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)] disabled:opacity-50">Link document</button></form> : null}
    </section>
  </DashboardShell>;
}
