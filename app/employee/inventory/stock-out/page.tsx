import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getAuthorizedStockOutQueue } from "@/lib/inventory/stock-out-data";
import { dateTime, label } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

export default async function EmployeeStockOutQueuePage() {
  await connection();
  const { profile, permissions } = await requirePermission(
    "inventory.release_sales_stock",
  );
  const requests = await getAuthorizedStockOutQueue(profile.id);

  return (
    <DashboardShell
      title="স্টক থেকে পণ্য রিলিজ / Stock Out"
      subtitle="Release packed products against finalized Sales Invoices from your authorized warehouse queue."
      employeePermissions={permissions}
    >
      <section className="mb-4 rounded-xl border bg-[var(--surface)] p-4">
        <h2 className="font-bold">Physical product release workflow</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted-text)]">
          <li>Open a finalized Sales Invoice request for your warehouse.</li>
          <li>Verify packed quantities and the exact physical SEN Serials.</li>
          <li>Confirm only the products physically leaving the warehouse now.</li>
        </ol>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {requests.map((request) => (
          <article key={request.id} className="rounded-xl border bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{request.invoiceNumber}</h2>
                <p className="text-sm text-[var(--muted-text)]">
                  {request.orderNumber} · Revision {request.invoiceRevision}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${request.status === "partially_released" ? "bg-amber-100 text-amber-900" : "bg-cyan-100 text-cyan-900"}`}>
                {request.status === "partially_released" ? "Partially released" : label(request.status)}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-[var(--muted-text)]">Customer</dt><dd className="font-semibold">{request.customerName}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Warehouse</dt><dd className="font-semibold">{request.warehouseName}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Required</dt><dd className="font-semibold">{request.requiredQuantity}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Released</dt><dd className="font-semibold">{request.releasedQuantity}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Remaining</dt><dd className="text-lg font-bold text-amber-800">{request.remainingQuantity}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Updated</dt><dd>{dateTime(request.updatedAt)}</dd></div>
            </dl>
            {request.invoiceRevisionPending ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                Invoice revision pending. Release is locked until the revised invoice is finalized.
              </p>
            ) : (
              <a href={`/employee/inventory/stock-out/${request.id}`} className="mt-3 inline-flex rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">
                Open product release
              </a>
            )}
          </article>
        ))}
      </section>
      {!requests.length ? (
        <p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">
          No finalized Sales Invoices are waiting for Stock Out in your authorized warehouse.
        </p>
      ) : null}
    </DashboardShell>
  );
}
