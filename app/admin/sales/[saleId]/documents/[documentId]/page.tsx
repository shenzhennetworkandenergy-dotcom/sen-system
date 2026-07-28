import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { money, label, dateTime } from "@/lib/orders/types";
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
  const { data, error } = await createSupabaseAdminClient()
    .from("sale_documents")
    .select("*")
    .eq("id", documentId)
    .eq("order_id", saleId)
    .maybeSingle();
  if (error || !data) notFound();

  const snapshot = data.snapshot as Snapshot;
  const order = snapshot.order;
  const customer = snapshot.customer;
  const address = (order.shipping_address_snapshot ?? {}) as Record<string, unknown>;
  const isInvoice = data.document_type === "invoice";
  const accent = isInvoice ? "from-indigo-700 to-cyan-600" : "from-emerald-700 to-teal-500";
  const title = isInvoice ? "TAX INVOICE" : "DELIVERY CHALLAN";
  const currency = text(order.currency, "BDT");

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          html, body { background: white !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
      <main className="mx-auto min-h-[297mm] w-full max-w-[210mm] overflow-hidden bg-white text-slate-900 shadow-2xl print:min-h-0 print:max-w-none print:shadow-none">
        <header className={`bg-gradient-to-r ${accent} px-8 py-7 text-white`}>
          <div className="flex items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="rounded-2xl bg-white p-2 shadow-lg">
                <Image src="/brand/sen-official-logo.png" alt="SEN" width={66} height={66} />
              </span>
              <div>
                <h1 className="text-2xl font-black tracking-tight">Shenzhen Energy &amp; Networks</h1>
                <p className="mt-1 text-sm text-white/85">Enterprise technology, energy and infrastructure</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black tracking-wide">{title}</h2>
              <p className="mt-2 rounded-full bg-white/15 px-3 py-1 font-mono text-sm">{text(data.document_number)}</p>
              <p className="mt-2 text-xs text-white/80">{dateTime(data.created_at)}</p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-5 border-b border-slate-200 bg-slate-50 px-8 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Bill to</p>
            <h3 className="mt-2 text-lg font-bold">{text(customer.full_name ?? customer.email, "Customer")}</h3>
            {customer.company_name ? <p>{text(customer.company_name)}</p> : null}
            <p className="mt-2 text-sm text-slate-600">{text(customer.email)}</p>
            <p className="text-sm text-slate-600">{text(customer.phone)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Deliver to</p>
            <h3 className="mt-2 text-lg font-bold">{text(address.recipient_name, "Customer")}</h3>
            <p className="text-sm text-slate-700">{text(address.address_line_1)}</p>
            {address.address_line_2 ? <p className="text-sm text-slate-700">{text(address.address_line_2)}</p> : null}
            <p className="text-sm text-slate-700">
              {[address.area, address.city, address.region, address.postal_code, address.country_code]
                .filter(Boolean)
                .map((value) => text(value))
                .join(", ")}
            </p>
            {address.phone ? <p className="mt-1 text-sm text-slate-600">{text(address.phone)}</p> : null}
          </div>
        </section>

        <section className="px-8 py-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="w-[43%] px-4 py-3">Product</th>
                  <th className="w-[12%] px-3 py-3 text-center">Qty</th>
                  {isInvoice ? <th className="w-[20%] px-3 py-3 text-right">Unit price</th> : null}
                  {isInvoice ? <th className="w-[25%] px-4 py-3 text-right">Line total</th> : <th className="px-4 py-3">Remarks</th>}
                </tr>
              </thead>
              <tbody>
                {snapshot.items.map((item, index) => (
                  <tr key={text(item.id, String(index))} className="border-t border-slate-200 even:bg-slate-50">
                    <td className="px-4 py-4 align-top">
                      <b className="block">{text(item.product_name_snapshot)}</b>
                      <span className="mt-1 block font-mono text-xs text-slate-500">SKU {text(item.sku_snapshot)}</span>
                      <span className="text-xs text-slate-500">
                        {[item.brand_snapshot, item.model_number_snapshot].filter(Boolean).map((value) => text(value)).join(" · ")}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-center align-top font-bold">{text(item.quantity)}</td>
                    {isInvoice ? <td className="px-3 py-4 text-right align-top">{money(item.unit_price as number, currency)}</td> : null}
                    {isInvoice ? (
                      <td className="px-4 py-4 text-right align-top font-bold">{money(item.line_total as number, currency)}</td>
                    ) : (
                      <td className="px-4 py-4 text-slate-500">Checked and packed</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isInvoice ? (
            <div className="ml-auto mt-5 w-[48%] rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              {[
                ["Subtotal", order.subtotal],
                ["Discount", order.discount_amount],
                ["Shipping", order.shipping_amount],
                ["Service", order.service_amount],
                ["VAT / tax", order.tax_amount],
              ].map(([name, amount]) => (
                <p key={text(name)} className="flex justify-between gap-4 py-1">
                  <span className="text-slate-600">{text(name)}</span>
                  <span>{money(amount as number, currency)}</span>
                </p>
              ))}
              <p className={`mt-3 flex justify-between gap-4 rounded-xl bg-gradient-to-r ${accent} px-4 py-3 text-lg font-black text-white`}>
                <span>Total</span><span>{money(order.total_amount as number, currency)}</span>
              </p>
              <p className="mt-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment: {label(text(order.payment_status))}
              </p>
            </div>
          ) : null}

          {snapshot.serials.length ? (
            <section className="mt-6 rounded-2xl border border-slate-200 p-4">
              <h3 className="font-bold">Assigned serial numbers</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {snapshot.serials.map((serial, index) => (
                  <p key={`${text(serial.sen_serial)}-${index}`} className="rounded-lg bg-slate-50 p-2 font-mono">
                    SEN: {text(serial.sen_serial)}
                    {serial.manufacturer_serial ? <><br />MFR: {text(serial.manufacturer_serial)}</> : null}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-12 grid grid-cols-2 gap-16 pt-8 text-center text-sm">
            <p className="border-t-2 border-slate-400 pt-2 font-semibold">Authorized signature</p>
            <p className="border-t-2 border-slate-400 pt-2 font-semibold">Customer signature</p>
          </section>
          <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            Thank you for choosing SEN. This document was generated electronically on {dateTime(snapshot.generated_at)}.
          </footer>
          <div className="mt-6 flex gap-3 print:hidden">
            <PrintDocumentButton />
            <a href={`/admin/sales/${saleId}`} className="rounded-lg border px-4 py-2 font-semibold">Back to sale</a>
          </div>
        </section>
      </main>
    </>
  );
}
