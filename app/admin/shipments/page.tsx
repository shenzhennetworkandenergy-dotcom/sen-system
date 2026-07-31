import { connection } from "next/server";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getShipments } from "@/lib/orders/data";
import { dateTime, label } from "@/lib/orders/types";
import { getInboundPurchaseShipments } from "@/lib/purchasing/data";

export const dynamic = "force-dynamic";

type InboundOrder = {
  id: string;
  order_number: string;
  suppliers: { name: string } | null;
  warehouses: { name: string; code: string } | null;
};

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    mode?: string;
    page?: string;
    error?: string;
  }>;
}) {
  await connection();
  await requirePermission("shipments.view");
  const params = await searchParams;
  const [{ shipments, count, page, size }, inboundShipments] = await Promise.all([
    getShipments(params),
    getInboundPurchaseShipments(),
  ]);

  return (
    <DashboardShell
      admin
      title="Shipments"
      subtitle="Manage supplier inbound logistics and customer delivery progress."
    >
      {params.error ? (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          {params.error}
        </p>
      ) : null}

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Supplier inbound shipments</h2>
            <p className="text-sm text-[var(--muted-text)]">
              Purchase-order shipments moving from suppliers into SEN warehouses.
            </p>
          </div>
          <Link
            href="/admin/purchasing"
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            Open purchasing
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {inboundShipments.map((shipment) => {
            const order = shipment.purchase_orders as unknown as InboundOrder | null;
            return (
              <article
                key={shipment.id}
                className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <a
                      href={`/admin/purchasing/${order?.id}`}
                      className="text-lg font-semibold text-[var(--primary)]"
                    >
                      {order?.order_number ?? "Purchase order"}
                    </a>
                    <p className="text-sm text-[var(--muted-text)]">
                      {order?.suppliers?.name ?? "Supplier"} →{" "}
                      {order?.warehouses?.name ?? "Destination warehouse"}
                    </p>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                    {label(shipment.status)}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--muted-text)]">Channel</dt>
                    <dd className="font-semibold">
                      {label(shipment.transport_mode)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-text)]">Carrier</dt>
                    <dd>{shipment.carrier_name ?? "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-text)]">Tracking</dt>
                    <dd>{shipment.tracking_number ?? "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-text)]">Expected arrival</dt>
                    <dd>{dateTime(shipment.expected_arrival_at)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
        {!inboundShipments.length ? (
          <p className="rounded-2xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">
            No supplier inbound shipments have been prepared yet.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Customer deliveries</h2>
        <form className="mb-5 grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 md:grid-cols-[1fr_12rem_12rem_auto]">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Shipment or external reference"
            className="rounded-xl border px-4 py-2.5"
          />
          <select
            name="status"
            defaultValue={params.status}
            className="rounded-xl border px-4 py-2.5"
          >
            <option value="">All statuses</option>
            {[
              "draft",
              "confirmed",
              "ready",
              "dispatched",
              "in_transit",
              "arrived",
              "out_for_delivery",
              "delivered",
              "cancelled",
            ].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <select
            name="mode"
            defaultValue={params.mode}
            className="rounded-xl border px-4 py-2.5"
          >
            <option value="">All modes</option>
            {[
              "air",
              "sea",
              "road",
              "local_delivery",
              "customer_pickup",
              "other",
            ].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">
            Filter
          </button>
        </form>
        <div className="grid gap-4 xl:grid-cols-2">
          {shipments.map((shipment) => {
            const order = shipment.sales_orders as unknown as {
              order_number: string;
              profiles: { full_name: string | null; email: string } | null;
            } | null;
            return (
              <article
                key={shipment.id}
                className="rounded-2xl border bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <a
                      href={`/admin/shipments/${shipment.id}`}
                      className="text-lg font-semibold text-[var(--primary)]"
                    >
                      {shipment.shipment_number}
                    </a>
                    <p className="text-sm text-[var(--muted-text)]">
                      Order {order?.order_number} ·{" "}
                      {order?.profiles?.full_name || order?.profiles?.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    {label(shipment.status)}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--muted-text)]">Mode</dt>
                    <dd className="font-semibold">
                      {label(shipment.transport_mode)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-text)]">Created</dt>
                    <dd>{dateTime(shipment.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-text)]">
                      Estimated arrival
                    </dt>
                    <dd>{dateTime(shipment.estimated_arrival_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-text)]">Packages</dt>
                    <dd>{shipment.package_count}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
        {!shipments.length ? (
          <p className="rounded-2xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">
            No customer shipments match these filters.
          </p>
        ) : null}
        <div className="mt-4 flex justify-between text-sm">
          <span>{count} customer shipment(s)</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <a href={`?page=${page - 1}`} className="rounded border px-3 py-1">
                Previous
              </a>
            ) : null}
            {page * size < count ? (
              <a href={`?page=${page + 1}`} className="rounded border px-3 py-1">
                Next
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
