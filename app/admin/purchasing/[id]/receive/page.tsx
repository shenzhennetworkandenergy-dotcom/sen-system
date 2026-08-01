import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { PurchaseReceiptForm } from "@/components/purchasing/PurchaseReceiptForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getEmployeePrimaryWarehouseId } from "@/lib/inventory/employee-stock-receiving";
import { getPurchaseOrder } from "@/lib/purchasing/data";
import { receivePurchaseOrderAction } from "../../actions";

export const dynamic = "force-dynamic";

const dhakaDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default async function ReceivePurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission(
    "inventory.receive_new_stock",
  );
  const { id } = await params;
  const data = await getPurchaseOrder(id);
  if (!data) notFound();
  if (profile.role === "employee") {
    const warehouseId = await getEmployeePrimaryWarehouseId(profile.id);
    if (!warehouseId || warehouseId !== data.order.destination_warehouse_id) {
      redirect(
        "/employee/inventory/receive?error=This%20purchase%20order%20is%20not%20assigned%20to%20your%20warehouse.",
      );
    }
  }
  if (!["received", "partially_received"].includes(data.order.status)) {
    const back = profile.role === "employee"
      ? "/employee/inventory/receive"
      : `/admin/purchasing/${id}`;
    redirect(`${back}?error=The%20supplier%20shipment%20must%20arrive%20before%20stock%20can%20be%20posted.`);
  }

  const expected = data.serials.filter((serial) => serial.status === "expected");

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={`Receive ${data.order.order_number}`}
      subtitle="Print each expected SEN serial, verify the physical units, then post a partial or full stock receipt atomically."
    >
      <a
        href={
          profile.role === "employee"
            ? "/employee/inventory/receive"
            : `/admin/purchasing/${id}`
        }
        className="mb-4 inline-block font-semibold text-[var(--primary)]"
      >
        ← Back
      </a>
      {expected.length ? (
        <section className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-5">
          <div>
            <h2 className="text-lg font-semibold text-sky-950">
              Expected SEN serial labels
            </h2>
            <p className="mt-1 text-sm text-sky-800">
              Print and attach each label to the matching physical unit before
              confirming receipt.
            </p>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {expected.map((serial, index) => (
              <article
                key={serial.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <span className="text-xs text-[var(--muted-text)]">
                    Unit {index + 1}
                  </span>
                  <code className="block truncate text-xs font-bold">
                    {serial.sen_serial}
                  </code>
                </div>
                <a
                  href={`/admin/serials/print?ids=${encodeURIComponent(serial.id)}`}
                  className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  Print label
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <PurchaseReceiptForm
        action={receivePurchaseOrderAction.bind(null, id)}
        items={data.items as never}
        defaultReceiptDate={dhakaDate()}
        warehouse={(data.order.warehouses ?? null) as never}
      />
    </DashboardShell>
  );
}
