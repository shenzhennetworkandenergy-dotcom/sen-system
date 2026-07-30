import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { calculateDocumentDiscounts } from "@/lib/documents/commercial-totals";
import { dateTime, label, money } from "@/lib/orders/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Snapshot = {
  order: Record<string, unknown>;
  customer: Record<string, unknown>;
  items: Record<string, unknown>[];
  serials: Record<string, unknown>[];
  generated_at: string;
};

const text = (value: unknown, fallback = "") => String(value ?? fallback);
const PAGE_SIZE = 8;

function SenDocumentHeader({
  title,
  number,
  createdAt,
  page,
  pages,
  invoice,
}: {
  title: string;
  number: string;
  createdAt: string;
  page: number;
  pages: number;
  invoice: boolean;
}) {
  return (
    <header
      className={`relative overflow-hidden bg-gradient-to-r ${
        invoice
          ? "from-slate-950 via-indigo-950 to-cyan-800"
          : "from-slate-950 via-emerald-900 to-teal-700"
      } px-6 py-5 text-white`}
    >
      <div className="absolute -right-14 -top-24 h-64 w-64 rounded-full border-[24px] border-white/5" />
      <div className="relative flex items-start justify-between gap-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-1.5 shadow-lg">
            <Image
              src="/brand/sen-official-logo.png"
              alt="SEN"
              width={48}
              height={48}
            />
          </span>
          <div>
            <h1 className="text-lg font-black tracking-tight">
              SHENZHEN ENERGY AND NETWORKS
            </h1>
            <p className="mt-1 max-w-[390px] text-xs leading-5 text-white/90">
              House- 67, Level-3, Laboratory Road, New Elephant Road
              (Backside of Multiplan Center), Dhaka- 1205
              <br />
              Call/Whatsapp: +8801805226599 · sen.com.bd ·
              szwaqia@vip.163.com
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-[0.08em]">{title}</h2>
          <p className="mt-1 font-mono text-xs">{number}</p>
          <p className="mt-1 text-xs text-white/85">
            Issue: {new Date(createdAt).toLocaleDateString("en-GB")}
          </p>
          {pages > 1 ? (
            <p className="text-xs text-white/75">
              Page {page} of {pages}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function AddressBlock({
  title,
  name,
  company,
  email,
  phone,
  lines,
}: {
  title: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  lines?: string[];
}) {
  return (
    <div>
      <p className="border-b border-slate-400 pb-1 text-xs font-black uppercase tracking-[0.14em] text-indigo-800">
        {title}
      </p>
      <p className="mt-2 text-sm font-black">{name}</p>
      {company ? <p className="text-xs">{company}</p> : null}
      {lines?.filter(Boolean).map((line) => (
        <p key={line} className="text-xs leading-5 text-slate-700">
          {line}
        </p>
      ))}
      {phone ? <p className="text-xs text-slate-700">{phone}</p> : null}
      {email ? <p className="text-xs text-slate-700">{email}</p> : null}
    </div>
  );
}

export default async function SaleDocumentPage({
  params,
}: {
  params: Promise<{ saleId: string; documentId: string }>;
}) {
  await connection();
  await requireAnyPermission([
    "sales.view",
    "sales.view_all",
    "sales.view_own",
    "sales.create_invoice",
    "sales.create_delivery_challan",
  ]);
  const { saleId, documentId } = await params;
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("sale_documents")
    .select("*")
    .eq("id", documentId)
    .eq("order_id", saleId)
    .maybeSingle();
  if (error || !data) notFound();
  const { data: payments, error: paymentsError } = await db
    .from("sale_payments")
    .select("id,amount,payment_date,method,reference_number,created_at")
    .eq("order_id", saleId)
    .eq("status", "received")
    .order("created_at", { ascending: true });
  if (paymentsError) throw new Error("Unable to load invoice payments.");

  const snapshot = data.snapshot as Snapshot;
  const order = snapshot.order;
  const discounts = calculateDocumentDiscounts(
    snapshot.items,
    order.discount_amount,
  );
  const customer = snapshot.customer;
  const address = (order.shipping_address_snapshot ?? {}) as Record<
    string,
    unknown
  >;
  const billing = (order.billing_address_snapshot ?? address) as Record<
    string,
    unknown
  >;
  const isInvoice = data.document_type === "invoice";
  const title = isInvoice ? "SALES INVOICE" : "DELIVERY CHALLAN";
  const currency = text(order.currency, "BDT");
  const paidAmount = (payments ?? []).reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const remainingBalance = Math.max(
    Number(order.total_amount ?? 0) - paidAmount,
    0,
  );
  const customerName = text(
    customer.full_name ?? customer.company_name ?? customer.email,
    "Customer",
  );
  const downloadName = `${customerName} - ${text(data.document_number)}`;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(snapshot.items.length / PAGE_SIZE)) },
    (_, index) =>
      snapshot.items.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE),
  );

  const addressLines = (value: Record<string, unknown>) => [
    [value.address_line_1, value.address_line_2]
      .filter(Boolean)
      .map((part) => text(part))
      .join(", "),
    [value.area, value.city, value.region, value.postal_code, value.country_code]
      .filter(Boolean)
      .map((part) => text(part))
      .join(", "),
  ];

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: white !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .document-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="overflow-x-auto bg-slate-200 py-5 print:overflow-visible print:bg-white print:py-0">
        {pages.map((items, pageIndex) => {
          const lastPage = pageIndex === pages.length - 1;
          return (
            <main
              key={pageIndex}
              className="document-page mx-auto mb-5 flex min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-[13px] text-slate-900 shadow-2xl break-after-page last:mb-0 last:break-after-auto print:shadow-none"
            >
              <SenDocumentHeader
                title={title}
                number={text(data.document_number)}
                createdAt={data.created_at}
                page={pageIndex + 1}
                pages={pages.length}
                invoice={isInvoice}
              />

              {pageIndex === 0 ? (
                <section className="grid grid-cols-2 gap-8 px-6 py-4">
                  <AddressBlock
                    title="Billed to"
                    name={text(
                      billing.recipient_name ??
                        customer.full_name ??
                        customer.email,
                      "Customer",
                    )}
                    company={text(customer.company_name)}
                    email={text(customer.email)}
                    phone={text(billing.phone ?? customer.phone)}
                    lines={addressLines(billing)}
                  />
                  <AddressBlock
                    title="Ship to"
                    name={text(address.recipient_name, "Customer")}
                    phone={text(address.phone)}
                    lines={addressLines(address)}
                  />
                </section>
              ) : (
                <p className="px-6 py-3 text-xs font-semibold text-slate-600">
                  Continued from page {pageIndex}
                </p>
              )}

              <section className="px-6">
                <div className="overflow-hidden border border-slate-300">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="w-[7%] px-2 py-2 text-center">No.</th>
                        <th className={isInvoice ? "w-[36%] px-2 py-2" : "w-[43%] px-2 py-2"}>Description</th>
                        <th className="w-[10%] px-2 py-2 text-center">Qty</th>
                        {isInvoice ? (
                          <th className="w-[17%] px-2 py-2 text-right">
                            Unit price
                          </th>
                        ) : null}
                        {isInvoice ? (
                          <th className="w-[14%] px-2 py-2 text-right">
                            Discount
                          </th>
                        ) : null}
                        <th className="px-2 py-2 text-right">
                          {isInvoice ? "Amount" : "Remarks"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr
                          key={text(item.id, String(index))}
                          className="border-t border-slate-200 even:bg-indigo-50/60"
                        >
                          <td className="px-2 py-2 text-center align-top">
                            {pageIndex * PAGE_SIZE + index + 1}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <b>{text(item.product_name_snapshot)}</b>
                            <span className="block font-mono text-[11px] leading-5 text-slate-600">
                              SKU {text(item.sku_snapshot, "—")}
                              {[item.brand_snapshot, item.model_number_snapshot]
                                .filter(Boolean)
                                .map((value) => ` · ${text(value)}`)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center align-top font-bold">
                            {text(item.quantity)}
                          </td>
                          {isInvoice ? (
                            <td className="px-2 py-2 text-right align-top">
                              {money(item.unit_price as number, currency)}
                            </td>
                          ) : null}
                          {isInvoice ? (
                            <td className="px-2 py-2 text-right align-top">
                              {money(item.line_discount as number, currency)}
                            </td>
                          ) : null}
                          <td className="px-2 py-2 text-right align-top font-bold">
                            {isInvoice
                              ? money(item.line_total as number, currency)
                              : "Checked and packed"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {lastPage ? (
                <section className="px-6 pt-4">
                  {isInvoice ? (
                    <div className="ml-auto w-[48%] text-xs">
                      {[
                        ["Subtotal", order.subtotal],
                        ["Discount", discounts.totalDiscount],
                        ["Shipping", order.shipping_amount],
                        ["Service", order.service_amount],
                        ["VAT / tax", order.tax_amount],
                      ].map(([name, amount]) => (
                        <p
                          key={text(name)}
                          className="flex justify-between border-b border-slate-200 px-2 py-1"
                        >
                          <span>{text(name)}</span>
                          <span>{money(amount as number, currency)}</span>
                        </p>
                      ))}
                      <p className="mt-1 flex justify-between bg-indigo-950 px-3 py-2 text-sm font-black text-white">
                        <span>Total</span>
                        <span>{money(order.total_amount as number, currency)}</span>
                      </p>
                      <p className="mt-1 flex justify-between bg-emerald-50 px-3 py-2 font-bold text-emerald-900">
                        <span>Amount paid</span>
                        <span>{money(paidAmount, currency)}</span>
                      </p>
                      <p className="flex justify-between bg-amber-50 px-3 py-2 font-bold text-amber-950">
                        <span>Remaining balance</span>
                        <span>{money(remainingBalance, currency)}</span>
                      </p>
                      <p className="mt-1 text-right text-[11px] font-semibold uppercase text-slate-600">
                        Payment:{" "}
                        {paidAmount === 0
                          ? "Unpaid"
                          : remainingBalance > 0
                            ? "Partially paid"
                            : "Paid"}
                      </p>
                    </div>
                  ) : null}

                  {isInvoice && payments?.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-black uppercase tracking-wide text-indigo-900">
                        Payment history
                      </p>
                      <table className="mt-1 w-full border-collapse text-[11px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="border px-2 py-1 text-left">Amount paid</th>
                            <th className="border px-2 py-1 text-left">Payment method</th>
                            <th className="border px-2 py-1 text-left">Date and time</th>
                            <th className="border px-2 py-1 text-left">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment) => (
                            <tr key={payment.id}>
                              <td className="border px-2 py-1 font-semibold">
                                {money(payment.amount, currency)}
                              </td>
                              <td className="border px-2 py-1">
                                {label(payment.method)}
                              </td>
                              <td className="border px-2 py-1">
                                {dateTime(payment.created_at)}
                              </td>
                              <td className="border px-2 py-1">
                                {payment.reference_number || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {snapshot.serials.length ? (
                    <div className="mt-3 border-t border-slate-300 pt-2">
                      <p className="text-xs font-black uppercase tracking-wide">
                        Assigned serial numbers
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600">
                        {snapshot.serials
                          .map((serial) => text(serial.sen_serial))
                          .join(" · ")}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-8 grid grid-cols-2 gap-16 text-center text-xs">
                    <p className="border-t border-slate-500 pt-1 font-semibold">
                      Authorized signature
                    </p>
                    <p className="border-t border-slate-500 pt-1 font-semibold">
                      Customer signature
                    </p>
                  </div>
                </section>
              ) : null}

              <footer className="mt-auto border-t border-slate-200 px-6 py-3 text-center text-[11px] text-slate-600">
                Thank you for choosing SEN · +8801805226599 · sen.com.bd ·
                szwaqia@vip.163.com
                <span className="ml-2">
                  Generated {dateTime(snapshot.generated_at)}
                </span>
              </footer>
            </main>
          );
        })}

        <div className="mx-auto mt-4 flex max-w-[210mm] gap-3 print:hidden">
          <PrintDocumentButton fileName={downloadName} />
          <a
            href={`/admin/sales/${saleId}`}
            className="rounded-lg border bg-white px-4 py-2 font-semibold"
          >
            Back to sale
          </a>
        </div>
      </div>
    </>
  );
}
