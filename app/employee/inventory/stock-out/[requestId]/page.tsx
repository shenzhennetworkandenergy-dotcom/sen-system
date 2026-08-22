import { randomUUID } from "node:crypto";

import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { StockOutReleaseForm, type StockOutReleaseItem } from "@/components/inventory/StockOutReleaseForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getAuthorizedStockOutRequest } from "@/lib/inventory/stock-out-data";
import { dateTime, label } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

export default async function EmployeeStockOutRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission(
    "inventory.release_sales_stock",
  );
  const { requestId } = await params;
  const detail = await getAuthorizedStockOutRequest(profile.id, requestId);
  if (!detail) notFound();

  const invoice = detail.invoice as { document_number?: string; revision_number?: number } | null;
  const order = detail.order as { order_number?: string } | null;
  const customer = detail.customer as { full_name?: string; email?: string; company_name?: string } | null;
  const warehouse = detail.warehouse as { name?: string; code?: string } | null;
  const releasableItems: StockOutReleaseItem[] = detail.items
    .filter((item) => Number(item.remaining_quantity) > 0)
    .map((item) => {
      const eligiblePreassigned = item.preassignedSerials
        .filter((serial) => ["available", "reserved", "allocated", "packed"].includes(String(serial.status)))
        .map((serial) => ({
          id: String(serial.id),
          sen_serial: serial.sen_serial ? String(serial.sen_serial) : null,
          manufacturer_serial: serial.manufacturer_serial ? String(serial.manufacturer_serial) : null,
          status: String(serial.status),
          preselected: true,
        }));
      return {
        requestItemId: String(item.id),
        productName: String(item.product_name_snapshot),
        sku: String(item.sku_snapshot),
        remainingQuantity: Number(item.remaining_quantity),
        packedRemainingQuantity: Math.max(0, Number(item.packedQuantity) - Number(item.released_quantity)),
        serialTrackingRequired: Boolean(item.serial_tracking_required),
        preassignedSerials: eligiblePreassigned,
      };
    });
  const replacementOperationIds = Object.fromEntries(
    releasableItems.flatMap((item) => item.preassignedSerials.map((serial) => [serial.id, randomUUID()])),
  );

  return (
    <DashboardShell
      title={invoice?.document_number ?? detail.request.request_number}
      subtitle={`${order?.order_number ?? "Sales Invoice"} · ${warehouse?.name ?? "Authorized warehouse"}`}
      employeePermissions={permissions}
    >
      <Link href="/employee/inventory/stock-out" className="mb-3 inline-block font-semibold text-[var(--primary)]">← Back to Stock Out queue</Link>
      <section className="grid gap-3 rounded-xl border bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><span className="text-xs text-[var(--muted-text)]">Status</span><b className="block">{label(detail.request.status)}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">Revision</span><b className="block">{invoice?.revision_number ?? detail.request.current_revision_number}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">Customer</span><b className="block">{customer?.company_name || customer?.full_name || customer?.email}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">Released</span><b className="block">{detail.request.released_quantity}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">Remaining</span><b className="block text-amber-800">{detail.request.remaining_quantity}</b></div>
      </section>

      {detail.request.invoice_revision_pending ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-950">
          This invoice was revised. Stock Out is locked until the latest revision is finalized.
        </p>
      ) : null}

      <section className="mt-4 space-y-3">
        <h2 className="text-xl font-bold">Products and physical verification</h2>
        {detail.items.map((item) => {
          const required = Number(item.required_quantity);
          const released = Number(item.released_quantity);
          const remaining = Number(item.remaining_quantity);
          const packed = Number(item.packedQuantity);
          return (
            <article key={String(item.id)} className="rounded-xl border bg-[var(--surface)] p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div><h3 className="font-bold">{String(item.product_name_snapshot)}</h3><p className="text-sm text-[var(--muted-text)]">{String(item.sku_snapshot)}</p></div>
                <div className="text-right text-sm"><b>{remaining} remaining</b><p>{released}/{required} released · {packed} packed</p></div>
              </div>
              {Boolean(item.serial_tracking_required) ? (
                <div className="mt-3 rounded-lg bg-[var(--muted-surface)] p-3">
                  <h4 className="font-semibold">SEN Serial verification</h4>
                  {item.preassignedSerials.length ? (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {item.preassignedSerials.map((serial) => (
                        <li key={String(serial.id)} className="rounded border bg-[var(--surface)] p-2 text-sm">
                          <b>{String(serial.sen_serial)}</b>{serial.manufacturer_serial ? ` · ${String(serial.manufacturer_serial)}` : ""}<br />
                          <span className="text-xs">Pre-selected · {label(String(serial.status))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm">Scan or search eligible SEN Serial Numbers when confirming this release.</p>}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {!detail.request.invoice_revision_pending && ["pending_release", "partially_released"].includes(detail.request.status) && releasableItems.length ? (
        <StockOutReleaseForm
          requestId={detail.request.id}
          requestVersion={Number(detail.request.version)}
          operationId={randomUUID()}
          items={releasableItems}
          replacementOperationIds={replacementOperationIds}
        />
      ) : null}

      <section className="mt-4 rounded-xl border bg-[var(--surface)] p-4">
        <h2 className="font-bold">Release history</h2>
        {detail.releases.map((release) => (
          <p key={String(release.id)} className="mt-2 rounded-lg bg-[var(--muted-surface)] p-3 text-sm">
            <b>{String(release.quantity_released)} unit(s)</b> released by {String(release.released_by_name)} · {dateTime(String(release.released_at))}
          </p>
        ))}
        {!detail.releases.length ? <p className="mt-2 text-sm text-[var(--muted-text)]">No physical Stock Out has been confirmed yet.</p> : null}
      </section>
    </DashboardShell>
  );
}
