import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getPurchaseOrder } from "@/lib/purchasing/data";
import {
  transitionPurchaseInboundShipmentAction,
  transitionPurchaseOrderAction,
} from "../actions";

export const dynamic = "force-dynamic";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number | string, currency: string) =>
  `${currency} ${Number(value).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-BD") : "Not set";

type Supplier = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
};

type Warehouse = { code: string; name: string };

export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("purchasing.view");
  const { id } = await params;
  const messages = await searchParams;
  const data = await getPurchaseOrder(id);
  if (!data) notFound();

  const order = data.order;
  const supplier = order.suppliers as Supplier | null;
  const warehouse = order.warehouses as Warehouse | null;
  const inbound = data.inboundShipment;
  const cancellable = ["draft", "pending_approval", "approved", "ordered"].includes(
    order.status,
  );
  const canReceiveNewStock = profile.role === "admin" || (
    permissions.has("purchasing.receive") && permissions.has("inventory.receive_new_stock")
  );

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={order.order_number}
      subtitle={`${supplier?.name ?? "Supplier"} → ${warehouse?.name ?? "Destination warehouse"}`}
    >
      {messages.success ? (
        <p className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">
          {messages.success}
        </p>
      ) : null}
      {messages.error ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
          {messages.error}
        </p>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Status", label(order.status)],
          ["Order date", order.order_date],
          ["Expected", order.expected_delivery_date ?? "Not set"],
          ["Total", money(order.total_amount, order.currency)],
          ["Payment", label(order.payment_status)],
          ["Supplier reference", order.supplier_reference ?? "—"],
          ["Created", dateTime(order.created_at)],
          ["Updated", dateTime(order.updated_at)],
        ].map(([name, value]) => (
          <article
            key={name}
            className="rounded-xl border bg-[var(--surface)] p-3 shadow-sm"
          >
            <p className="text-xs text-[var(--muted-text)]">{name}</p>
            <p className="mt-1 font-bold">{value}</p>
          </article>
        ))}
      </section>

      <div className="my-3 flex flex-wrap gap-2">
        {order.status === "draft" ? (
          <>
            <a
              href={`/admin/purchasing/${id}/edit`}
              className="rounded-xl border px-4 py-2.5 font-bold"
            >
              Edit draft
            </a>
            <form action={transitionPurchaseOrderAction.bind(null, id, "submit")}>
              <button className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-bold text-[var(--primary-foreground)]">
                Submit for approval
              </button>
            </form>
          </>
        ) : null}
        {order.status === "pending_approval" ? (
          <form action={transitionPurchaseOrderAction.bind(null, id, "approve")}>
            <button className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white">
              Approve
            </button>
          </form>
        ) : null}
        {order.status === "approved" ? (
          <form action={transitionPurchaseOrderAction.bind(null, id, "order")}>
            <button className="rounded-xl bg-blue-700 px-4 py-2.5 font-bold text-white">
              Confirm supplier order
            </button>
          </form>
        ) : null}
        {order.status === "ready_for_shipment" ? (
          <form
            action={transitionPurchaseInboundShipmentAction.bind(null, id, "ship")}
            className="flex flex-wrap gap-2"
          >
            <input
              name="note"
              maxLength={1000}
              placeholder="Dispatch note (optional)"
              className="rounded-xl border px-3 py-2.5"
            />
            <button className="rounded-xl bg-blue-700 px-4 py-2.5 font-bold text-white">
              Mark shipped
            </button>
          </form>
        ) : null}
        {order.status === "shipped" ? (
          <form
            action={transitionPurchaseInboundShipmentAction.bind(
              null,
              id,
              "receive",
            )}
            className="flex flex-wrap gap-2"
          >
            <input
              name="note"
              maxLength={1000}
              placeholder="Arrival note (optional)"
              className="rounded-xl border px-3 py-2.5"
            />
            <button className="rounded-xl bg-teal-700 px-4 py-2.5 font-bold text-white">
              Confirm physical arrival
            </button>
          </form>
        ) : null}
        {["received", "partially_received"].includes(order.status) && canReceiveNewStock ? (
          <a
            href={`/admin/purchasing/${id}/receive`}
            className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-bold text-[var(--primary-foreground)]"
          >
            Receive into stock
          </a>
        ) : null}
        {order.status === "stock_received" ? (
          <form action={transitionPurchaseOrderAction.bind(null, id, "close")}>
            <button className="rounded-xl border px-4 py-2.5 font-bold">
              Close order
            </button>
          </form>
        ) : null}
        {cancellable ? (
          <form action={transitionPurchaseOrderAction.bind(null, id, "cancel")}>
            <button className="rounded-xl border border-red-300 px-4 py-2.5 font-bold text-red-700">
              Cancel
            </button>
          </form>
        ) : null}
      </div>

      {order.status === "ordered" ? (
        <form
          action={transitionPurchaseInboundShipmentAction.bind(null, id, "prepare")}
          className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
        >
          <div className="mb-3">
            <h2 className="font-bold text-blue-950">Prepare supplier shipment</h2>
            <p className="text-sm text-blue-800">
              Choose the inbound channel and add available carrier details before
              dispatch.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold">
              Shipment channel *
              <select
                name="transport_mode"
                required
                defaultValue=""
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5"
              >
                <option value="" disabled>
                  Select channel
                </option>
                <option value="air">By air</option>
                <option value="sea">By sea</option>
                <option value="road">By road</option>
                <option value="courier">Courier</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Carrier
              <input
                name="carrier_name"
                maxLength={200}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-semibold">
              Tracking number
              <input
                name="tracking_number"
                maxLength={200}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-semibold">
              Expected departure
              <input
                type="datetime-local"
                name="expected_departure_at"
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-semibold">
              Expected arrival
              <input
                type="datetime-local"
                name="expected_arrival_at"
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5"
              />
            </label>
            <label className="text-sm font-semibold md:col-span-2">
              Shipment note
              <input
                name="note"
                maxLength={1000}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5"
              />
            </label>
          </div>
          <button className="mt-3 rounded-xl bg-blue-700 px-4 py-2.5 font-bold text-white">
            Mark ready for shipment
          </button>
        </form>
      ) : null}

      {inbound ? (
        <section className="mb-3 rounded-xl border bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold">Supplier inbound shipment</h2>
              <p className="text-sm text-[var(--muted-text)]">
                {label(inbound.status)} · {label(inbound.transport_mode)}
              </p>
            </div>
            <Link
              href="/admin/shipments"
              className="rounded-lg border px-3 py-2 text-sm font-semibold"
            >
              Open shipment module
            </Link>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[var(--muted-text)]">Carrier</dt>
              <dd className="font-semibold">{inbound.carrier_name ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-text)]">Tracking</dt>
              <dd className="font-semibold">
                {inbound.tracking_number ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted-text)]">Expected arrival</dt>
              <dd>{dateTime(inbound.expected_arrival_at)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-text)]">Dispatched</dt>
              <dd>{dateTime(inbound.shipped_at)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]">
            <tr>
              {[
                "Product",
                "SKU",
                "Ordered",
                "Received",
                "Rejected",
                "Unit cost",
                "Line total",
              ].map((head) => (
                <th key={head} className="p-3">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3 font-bold">{item.product_name_snapshot}</td>
                <td className="p-3 font-mono text-xs">{item.sku_snapshot}</td>
                <td className="p-3">{Number(item.quantity_ordered)}</td>
                <td className="p-3">{Number(item.quantity_received)}</td>
                <td className="p-3">{Number(item.quantity_rejected)}</td>
                <td className="p-3">{money(item.unit_cost, order.currency)}</td>
                <td className="p-3 font-bold">
                  {money(item.line_total, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-3 grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border bg-[var(--surface)] p-4">
          <h2 className="font-bold">Receipts</h2>
          {data.receipts.length ? (
            <ul className="mt-2 divide-y">
              {data.receipts.map((receipt) => (
                <li key={receipt.id} className="py-2">
                  <strong>{receipt.receipt_number}</strong>
                  <span className="ml-2 text-sm">{receipt.receipt_date}</span>
                  <span className="block text-xs text-[var(--muted-text)]">
                    {receipt.supplier_delivery_reference ?? "No delivery reference"}
                  </span>
                  {receipt.purchase_receipt_items.some((item) => item.serial_generation_batch_id) ? (
                    <span className="mt-1 block text-xs font-semibold text-emerald-700">
                      Unique SEN serials generated automatically
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted-text)]">
              No stock receipt posted yet.
            </p>
          )}
        </article>
        <article className="rounded-xl border bg-[var(--surface)] p-4">
          <h2 className="font-bold">Status history</h2>
          <ol className="relative mt-4 ml-2 border-l-2 border-sky-400">
            {data.events.map((event) => (
              <li key={event.id} className="relative pb-5 pl-6 last:pb-0">
                <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-sky-500 ring-4 ring-white" />
                <strong className="block">
                  {event.previous_status
                    ? `${label(event.previous_status)} → `
                    : ""}
                  {label(event.new_status)}
                </strong>
                <time className="block text-xs text-[var(--muted-text)]">
                  {dateTime(event.created_at)}
                </time>
                {event.note ? (
                  <p className="mt-1 text-sm text-[var(--muted-text)]">
                    {event.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </article>
      </section>
    </DashboardShell>
  );
}
