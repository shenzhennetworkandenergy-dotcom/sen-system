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
  const requestStatusTone = detail.request.status === "fully_released"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : detail.request.status === "partially_released"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <DashboardShell
      title={invoice?.document_number ?? detail.request.request_number}
      subtitle={`${order?.order_number ?? "Sales Invoice"} · ${warehouse?.name ?? "Authorized warehouse"}`}
      employeePermissions={permissions}
    >
      <Link
        href="/employee/inventory/stock-out"
        className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-[var(--primary)] shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
      >
        <span aria-hidden="true">←</span> Back to Stock Out queue
      </Link>
      <section
        aria-label="Stock Out request summary"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-text)]">Status</span>
          <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${requestStatusTone}`}>
            {label(detail.request.status)}
          </span>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">Revision</span>
          <b className="mt-2 block text-xl text-slate-900">{invoice?.revision_number ?? detail.request.current_revision_number}</b>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:col-span-2 lg:col-span-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-text)]">Customer</span>
          <b className="mt-2 block break-words text-slate-900">{customer?.company_name || customer?.full_name || customer?.email}</b>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Released</span>
          <b className="mt-2 block text-xl text-emerald-800">{detail.request.released_quantity}</b>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900">Remaining</span>
          <b className="mt-2 block text-xl text-amber-900">{detail.request.remaining_quantity}</b>
        </div>
      </section>

      {detail.request.invoice_revision_pending ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-950">
          This invoice was revised. Stock Out is locked until the latest revision is finalized.
        </p>
      ) : null}

      <section className="mt-5 space-y-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Products and physical verification</h2>
          <p className="mt-1 text-sm text-[var(--muted-text)]">Review each product requirement before setting the physical release quantity.</p>
        </div>
        {detail.items.map((item) => {
          const required = Number(item.required_quantity);
          const released = Number(item.released_quantity);
          const remaining = Number(item.remaining_quantity);
          const packed = Number(item.packedQuantity);
          return (
            <article key={String(item.id)} className="rounded-2xl border border-slate-200 border-l-4 border-l-blue-600 bg-white p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <h3 className="break-words font-bold text-slate-900">{String(item.product_name_snapshot)}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-text)]">SKU: {String(item.sku_snapshot)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold sm:justify-end">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">Remaining {remaining}</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">Released {released}/{required}</span>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">Packed {packed}</span>
                </div>
              </div>
              {Boolean(item.serial_tracking_required) ? (
                <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-indigo-950">SEN Serial verification</h4>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">Serial verification required</span>
                  </div>
                  {item.preassignedSerials.length ? (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {item.preassignedSerials.map((serial) => (
                        <li key={String(serial.id)} className="rounded-lg border border-emerald-200 bg-white p-2 text-sm shadow-sm">
                          <b>{String(serial.sen_serial)}</b>{serial.manufacturer_serial ? ` · ${String(serial.manufacturer_serial)}` : ""}<br />
                          <span className="text-xs font-medium text-emerald-700">Eligible and pre-selected · {label(String(serial.status))}</span>
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
          key={`${detail.request.id}:${detail.request.version}`}
          requestId={detail.request.id}
          requestVersion={Number(detail.request.version)}
          operationId={randomUUID()}
          items={releasableItems}
          replacementOperationIds={replacementOperationIds}
        />
      ) : null}

      <section aria-label="Release history timeline" className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-700">↻</span>
          <div>
            <h2 className="font-bold text-slate-900">Release history</h2>
            <p className="text-xs text-[var(--muted-text)]">Confirmed physical warehouse releases for this request.</p>
          </div>
        </div>
        <div className="relative mt-4 space-y-3 border-l-2 border-blue-100 pl-5">
          {detail.releases.map((release) => (
            <div key={String(release.id)} className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <span aria-hidden="true" className="absolute -left-[1.66rem] top-4 h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow" />
              <b>{String(release.quantity_released)} unit(s)</b> released by {String(release.released_by_name)}
              <p className="mt-1 text-xs text-[var(--muted-text)]">{dateTime(String(release.released_at))}</p>
            </div>
          ))}
          {!detail.releases.length ? (
            <div className="relative rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-[var(--muted-text)]">
              <span aria-hidden="true" className="absolute -left-[1.66rem] top-4 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
              No physical Stock Out has been confirmed yet.
            </div>
          ) : null}
        </div>
      </section>
    </DashboardShell>
  );
}
