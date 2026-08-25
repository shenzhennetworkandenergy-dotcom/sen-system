import { connection } from "next/server";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import Link from "next/link";

import { DashboardShell } from "@/components/dashboard/Shell";
import { SaleLineEditor } from "@/components/sales/SaleLineEditor";
import { SalePaymentMethodFields } from "@/components/sales/SalePaymentMethodFields";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { buildSaleSourceQuotationLookup } from "@/lib/quotations/access-policy";
import { getSaleSourceQuotationLink } from "@/lib/quotations/traceability";
import { dateTime, label, money } from "@/lib/orders/types";
import { getSale, getSaleAccessOwner } from "@/lib/sales/data";
import { getAuthorizedPhysicalReturnLinks } from "@/lib/inventory/rma-return-data";
import {
  deriveEffectiveDueDate,
  formatCommercialTerms,
  type PaymentTermsType,
} from "@/lib/sales/commercial-terms";
import {
  cancelSaleAction,
  confirmSaleAction,
  generateSaleDocumentAction,
  recordPaymentAction,
  updateSaleCommercialTermsAction,
} from "../actions";

export const dynamic = "force-dynamic";
const field = "rounded-lg border bg-[var(--surface)] px-3 py-2";

export default async function SaleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requireAnyPermission([
    "sales.view",
    "sales.view_all",
    "sales.view_own",
  ]);
  const { saleId } = await params;
  const notice = await searchParams;
  const saleAccess = await getSaleAccessOwner(saleId);
  if (!saleAccess) notFound();
  if (
    profile.role === "employee" &&
    !permissions.has("sales.view") &&
    !permissions.has("sales.view_all") &&
    saleAccess.createdBy !== profile.id
  ) {
    notFound();
  }
  const quotationLookup = buildSaleSourceQuotationLookup(
    saleId,
    profile.role,
    permissions,
    profile.id,
  );
  const data = await getSale(saleId, quotationLookup);
  if (!data) notFound();

  const {
    order,
    items,
    reservations,
    allocations,
    payments,
    adjustments,
    documents,
    shipments,
    events,
    audit,
    stockOutRequest,
    sourceQuotation,
  } = data;
  const sourceQuotationLink = getSaleSourceQuotationLink(sourceQuotation);
  const invoiceOperationId = randomUUID();
  const paymentOperationId = randomUUID();
  const commercialTermsOperationId = randomUUID();
  const customer = order.customer as {
    full_name: string | null;
    email: string;
    phone: string | null;
    company_name: string | null;
  };
  const employee = order.employee as { full_name: string | null; email: string };
  const outstanding = Math.max(
    Number(order.total_amount) - Number(order.paid_amount),
    0,
  );
  const activeReservations = reservations.filter((item) => item.status === "active");
  const activeAllocations = allocations.filter(
    (item) => !["released", "cancelled"].includes(item.status),
  );
  const isAdmin = profile.role === "admin";
  const canEditLines =
    !["delivered", "cancelled"].includes(order.status) &&
    (isAdmin || permissions.has("sales.edit"));
  const canChangePrice = isAdmin || permissions.has("sales.change_price");
  const canApplyDiscount = isAdmin || permissions.has("sales.apply_discount");
  const canEditCommercialTerms = isAdmin || permissions.has("sales.edit");
  const nonVoidInvoices = documents.filter(
    (document) => document.document_type === "invoice" && document.status !== "voided",
  );
  const hasNonVoidInvoice = nonVoidInvoices.length > 0;
  const commercialTerms = {
    paymentTermsType: order.payment_terms_type as PaymentTermsType | null,
    creditPeriodDays: order.credit_period_days === null
      ? null
      : Number(order.credit_period_days),
    paymentDueDate: order.payment_due_date as string | null,
  };
  const dueDate = deriveEffectiveDueDate({
    explicitDueDate: commercialTerms.paymentDueDate,
    creditPeriodDays: commercialTerms.creditPeriodDays,
    invoiceTimestamps: nonVoidInvoices.map((document) => document.created_at),
  });
  const presetPeriods = [7, 15, 30, 45, 60];
  const currentPreset = commercialTerms.creditPeriodDays === null
    ? ""
    : presetPeriods.includes(commercialTerms.creditPeriodDays)
      ? String(commercialTerms.creditPeriodDays)
      : "custom";
  const hasSupersededInvoice = documents.some(
    (document) =>
      document.document_type === "invoice" && document.status === "superseded",
  );
  const returnReceiptClaims = profile.role === "employee" && permissions.has("rma.receive")
    ? await getAuthorizedPhysicalReturnLinks(
        profile.id,
        saleId,
        order.fulfillment_warehouse_id,
      )
    : [];

  return (
    <DashboardShell
      admin={isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={order.order_number}
      subtitle="Sale detail, pricing, reservation, serials, payments, documents and shipment handoff."
    >
      {notice.success ? (
        <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
          {notice.success}
        </p>
      ) : null}
      {notice.error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          {notice.error}
        </p>
      ) : null}

      {sourceQuotationLink ? (
        <p className="mb-3 text-sm text-[var(--muted-text)]">
          {sourceQuotationLink.label}:{" "}
          <Link
            href={sourceQuotationLink.href}
            className="font-semibold text-[var(--primary)] underline"
          >
            {sourceQuotationLink.reference}
          </Link>
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {[
          ["Sale status", label(order.status)],
          ["Payment", label(order.payment_status)],
          ["Total", money(order.total_amount, order.currency)],
          ["Paid", money(order.paid_amount, order.currency)],
          ["Outstanding", money(outstanding, order.currency)],
          ["Reserved", activeReservations.length],
          ["Serials", activeAllocations.length],
          ["Shipments", shipments.length],
        ].map(([name, value]) => (
          <article key={name} className="rounded-xl border bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted-text)]">{name}</p>
            <strong className="mt-1 block text-lg">{value}</strong>
          </article>
        ))}
      </section>

      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === "draft" ? (
          <form action={confirmSaleAction.bind(null, saleId)}>
            <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">
              Confirm sale & reserve stock
            </button>
          </form>
        ) : null}
        {!["draft", "cancelled", "delivered"].includes(order.status) ? (
          <>
            <a href={`/admin/orders/${saleId}/allocate`} className="rounded-lg border px-4 py-2 font-semibold">
              Allocate / scan serials
            </a>
            <a href={`/admin/orders/${saleId}/pack`} className="rounded-lg border px-4 py-2 font-semibold">
              Pack sale
            </a>
            <a href={`/admin/orders/${saleId}/shipments/new`} className="rounded-lg border px-4 py-2 font-semibold">
              Create shipment / partial shipment
            </a>
          </>
        ) : null}
        <a href={`/admin/orders/${saleId}`} className="rounded-lg border px-4 py-2 font-semibold">
          Open fulfilment view
        </a>
        {!["cancelled", "delivered", "shipped"].includes(order.status) ? (
          <form action={cancelSaleAction.bind(null, saleId)} className="flex gap-2">
            <input name="reason" required placeholder="Cancellation reason" className={field} />
            <button className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-800">
              Cancel sale
            </button>
          </form>
        ) : null}
      </div>

      <section className="mt-4 grid gap-3 xl:grid-cols-[1.4fr_.6fr]">
        <div className="space-y-3">
          <article className="rounded-xl border border-blue-200 bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[var(--primary)]">Commercial payment terms</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  These terms drive the operational Customer Receivables due date. Payments still use Sales → Record Payment.
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                {formatCommercialTerms(commercialTerms)}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-[var(--muted-surface)] p-3"><dt className="text-[var(--muted-text)]">Effective due date</dt><dd className="font-semibold">{dueDate.dueDate ?? "Not set"}</dd></div>
              <div className="rounded-lg bg-[var(--muted-surface)] p-3"><dt className="text-[var(--muted-text)]">Due-date source</dt><dd className="font-semibold">{dueDate.source === "credit_period" ? "Credit period" : dueDate.source === "explicit" ? "Explicit due date" : "Not set"}</dd></div>
              <div className="rounded-lg bg-[var(--muted-surface)] p-3"><dt className="text-[var(--muted-text)]">Earliest valid invoice</dt><dd className="font-semibold">{dueDate.invoiceAnchorDate ?? "Not generated"}</dd></div>
            </dl>
            {canEditCommercialTerms ? hasNonVoidInvoice ? (
              <form action={updateSaleCommercialTermsAction.bind(null, saleId)} className="mt-3 grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 md:grid-cols-[1fr_2fr_auto]">
                <input type="hidden" name="operation_id" value={commercialTermsOperationId} />
                <label className="grid gap-1 text-sm font-semibold text-amber-950">
                  Explicit due date correction
                  <input type="date" name="payment_due_date" defaultValue={commercialTerms.paymentDueDate ?? dueDate.dueDate ?? ""} required className={field} />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-amber-950">
                  Correction reason
                  <input name="reason" required maxLength={1000} placeholder="Why the finalized due date is being corrected" className={field} />
                </label>
                <button className="self-end rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white">Save correction</button>
                <p className="text-xs text-amber-900 md:col-span-3">
                  Invoice finalized: payment type and credit period are locked. This audited correction changes only the explicit due date and does not rewrite invoice documents.
                </p>
              </form>
            ) : (
              <form action={updateSaleCommercialTermsAction.bind(null, saleId)} className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                <input type="hidden" name="operation_id" value={commercialTermsOperationId} />
                <label className="grid gap-1 text-sm font-semibold">Payment terms
                  <select name="payment_terms_type" defaultValue={commercialTerms.paymentTermsType ?? "immediate"} className={field}>
                    <option value="immediate">Immediate</option><option value="partial">Partial</option><option value="credit">Credit</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">Credit period
                  <select name="credit_period_preset" defaultValue={currentPreset} className={field}>
                    <option value="">No credit period</option><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option><option value="45">45 days</option><option value="60">60 days</option><option value="custom">Custom</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">Custom days
                  <input type="number" name="custom_credit_period_days" min={1} max={3650} step={1} defaultValue={currentPreset === "custom" ? commercialTerms.creditPeriodDays ?? "" : ""} className={field} />
                </label>
                <label className="grid gap-1 text-sm font-semibold">Explicit due date
                  <input type="date" name="payment_due_date" defaultValue={commercialTerms.paymentDueDate ?? ""} className={field} />
                </label>
                <button className="self-end rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Save terms</button>
                <p className="text-xs text-[var(--muted-text)] md:col-span-2 xl:col-span-5">
                  Before invoice finalization, an explicit due date overrides a period-derived date. Without a genuine date or invoice anchor, Receivables shows “Not set.”
                </p>
              </form>
            ) : null}
          </article>

          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Products & pricing</h2>
            <div className="mt-3 space-y-2">
              {items.map((item) => {
                const itemSerials = activeAllocations.filter(
                  (allocation) => allocation.order_item_id === item.id,
                );
                return (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <b>{item.product_name_snapshot}</b>
                        <p className="text-xs text-[var(--muted-text)]">
                          {[item.brand_snapshot, item.model_number_snapshot, `SKU ${item.sku_snapshot}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <b>{item.quantity} × {money(item.unit_price, item.currency)}</b>
                        <p>{money(item.line_total, item.currency)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span>
                        Reserved{" "}
                        {activeReservations
                          .filter((reservation) => reservation.order_item_id === item.id)
                          .reduce((sum, reservation) => sum + Number(reservation.quantity), 0)}
                      </span>
                      <span>Allocated {item.allocated_quantity}</span>
                      <span>Packed {item.packed_quantity}</span>
                      <span>Shipped {item.shipped_quantity}</span>
                      {item.serial_tracking_required_snapshot ? (
                        <span className={itemSerials.length === Number(item.quantity) ? "text-green-700" : "font-bold text-amber-700"}>
                          Serials {itemSerials.length}/{item.quantity}
                        </span>
                      ) : null}
                    </div>
                    {itemSerials.length ? (
                      <ul className="mt-2 grid gap-1 md:grid-cols-2">
                        {itemSerials.map((allocation) => {
                          const serial = allocation.serial_numbers as {
                            sen_serial: string;
                            manufacturer_serial: string | null;
                          };
                          return (
                            <li key={allocation.id} className="rounded bg-[var(--muted-surface)] p-2 text-xs">
                              <b>{serial.sen_serial}</b>
                              {serial.manufacturer_serial ? ` · ${serial.manufacturer_serial}` : ""} · {label(allocation.status)}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 border-t pt-3 text-right">
              <p>Subtotal {money(order.subtotal, order.currency)}</p>
              <p>Order discount {money(order.discount_amount, order.currency)}</p>
              <p>Shipping {money(order.shipping_amount, order.currency)}</p>
              <p>Service {money(order.service_amount, order.currency)}</p>
              <p>VAT/tax {money(order.tax_amount, order.currency)}</p>
              <b className="text-xl">Final total {money(order.total_amount, order.currency)}</b>
            </div>
            {canEditLines ? (
              <SaleLineEditor
                saleId={saleId}
                initialLines={items.map((item) => ({
                  id: item.id,
                  name: item.product_name_snapshot,
                  sku: item.sku_snapshot,
                  quantity: Number(item.quantity),
                  unitPrice: Number(item.unit_price),
                  discountType: item.discount_type === "percentage" ? "percentage" : "fixed",
                  discountValue: Number(item.discount_value ?? item.line_discount),
                  lineTax: Number(item.line_tax),
                  fulfilledFloor: Math.max(
                    Number(item.allocated_quantity),
                    Number(item.packed_quantity),
                    Number(item.shipped_quantity),
                    Number(item.delivered_quantity),
                  ),
                }))}
                currency={order.currency}
                orderDiscount={Number(order.discount_amount)}
                shipping={Number(order.shipping_amount)}
                service={Number(order.service_amount)}
                tax={Number(order.tax_amount)}
                paid={Number(order.paid_amount)}
                canChangePrice={canChangePrice}
                canApplyDiscount={canApplyDiscount}
              />
            ) : null}
          </article>

          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Payments</h2>
            <form action={recordPaymentAction.bind(null, saleId)} className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-7">
              <input type="hidden" name="operation_id" value={paymentOperationId} />
              <input name="amount" type="number" min=".01" step=".01" max={outstanding || undefined} placeholder="Amount" required className={field} />
              <input name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className={field} />
              <SalePaymentMethodFields fieldClass={field} />
              <input name="reference_number" placeholder="Reference" className={field} />
              <input name="internal_note" placeholder="Internal note" className={field} />
            </form>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Received by</th><th>Accounting</th></tr></thead>
                <tbody>
                  {payments.map((payment) => {
                    const receiver = payment.profiles as { full_name: string | null; email: string };
                    return (
                      <tr key={payment.id} className="border-t">
                        <td className="py-2">{payment.payment_date}</td>
                        <td>{money(payment.amount, order.currency)}</td>
                        <td>{label(payment.method)}</td>
                        <td>{payment.reference_number || "—"}</td>
                        <td>{receiver?.full_name || receiver?.email}</td>
                        <td>
                          {payment.accounting ? (
                            <span className="block text-xs">
                              <strong className="block text-emerald-700">{payment.accounting.journalEntryNumber || "Posted journal"}</strong>
                              Cash Book {payment.accounting.cashbookEntryId.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--muted-text)]">Historical payment · not backfilled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!payments.length ? <p className="py-4 text-sm text-[var(--muted-text)]">No payments recorded.</p> : null}
            </div>
          </article>

          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Documents</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={generateSaleDocumentAction.bind(null, saleId, "invoice")}>
                <input type="hidden" name="operation_id" value={invoiceOperationId} />
                <input type="hidden" name="request_version" value={stockOutRequest?.version ?? 0} />
                <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">
                  {hasSupersededInvoice ? "Generate Revised Invoice" : "Generate Invoice"}
                </button>
              </form>
              <form action={generateSaleDocumentAction.bind(null, saleId, "delivery_challan")}>
                <button className="rounded-lg border px-4 py-2 font-semibold">Generate Delivery Challan</button>
              </form>
              {documents.map((document) => (
                <a
                  key={document.id}
                  href={`/admin/sales/${saleId}/documents/${document.id}`}
                  className={`rounded-lg border px-4 py-2 font-semibold ${document.status === "superseded" ? "opacity-60" : ""}`}
                >
                  {document.document_number} · Revision {document.revision_number ?? 1} · {label(document.status)} · Print / PDF
                </a>
              ))}
              {stockOutRequest ? (
                <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-950">
                  Stock Out: {label(stockOutRequest.status)} · {stockOutRequest.remaining_quantity} remaining
                  {stockOutRequest.invoice_revision_pending ? " · revision pending" : ""}
                </span>
              ) : null}
            </div>
          </article>
          {returnReceiptClaims.length ? (
            <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="font-bold text-amber-950">Physical customer returns</h2>
              <p className="mt-1 text-sm text-amber-900">
                Confirm only products that have physically arrived back at your assigned warehouse.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {returnReceiptClaims.map((claim) => (
                  <Link
                    key={claim.id}
                    href={`/employee/rma/${claim.id}/receive`}
                    className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white"
                  >
                    Receive {claim.rmaNumber} · {claim.quantityRemaining} remaining
                  </Link>
                ))}
              </div>
            </article>
          ) : null}
        </div>

        <aside className="space-y-3">
          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Customer</h2>
            <p className="mt-2">
              <b>{customer.full_name || customer.email}</b><br />
              {customer.company_name}<br />
              {customer.email}<br />
              {customer.phone}
            </p>
            <a href={`/admin/users/${order.customer_profile_id}`} className="mt-3 inline-block font-semibold text-[var(--primary)]">
              View customer profile & history →
            </a>
          </article>
          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Sale information</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div><dt className="text-[var(--muted-text)]">Employee</dt><dd>{employee.full_name || employee.email}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Source</dt><dd>{label(order.sales_source)}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Expected delivery</dt><dd>{order.expected_delivery_date || "—"}</dd></div>
              <div><dt className="text-[var(--muted-text)]">Created</dt><dd>{dateTime(order.created_at)}</dd></div>
            </dl>
          </article>
          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Shipments</h2>
            {shipments.map((shipment) => (
              <a key={shipment.id} href={`/admin/shipments/${shipment.id}`} className="mt-2 block rounded-lg border p-3">
                <b>{shipment.shipment_number}</b><br />
                <span className="text-sm">{label(shipment.status)} · View tracking →</span>
              </a>
            ))}
            {!shipments.length ? <p className="mt-2 text-sm text-[var(--muted-text)]">No shipment created.</p> : null}
          </article>
          <article className="rounded-xl border bg-[var(--surface)] p-4">
            <h2 className="font-bold">Activity & price changes</h2>
            <p className="text-sm text-[var(--muted-text)]">
              {events.length + audit.length} operational activity records · {adjustments.length} adjustment(s).
            </p>
            {adjustments.slice(0, 5).map((adjustment) => (
              <p key={adjustment.id} className="mt-2 rounded bg-[var(--muted-surface)] p-2 text-xs">
                {label(adjustment.adjustment_type)}: {money(adjustment.previous_value, order.currency)} → {money(adjustment.new_value, order.currency)}
                <br />{adjustment.reason}
              </p>
            ))}
          </article>
        </aside>
      </section>
    </DashboardShell>
  );
}
