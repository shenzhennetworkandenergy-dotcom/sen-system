import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import { requirePermission } from "@/lib/auth/permissions";
import { calculateDocumentDiscounts } from "@/lib/documents/commercial-totals";
import { label, money } from "@/lib/orders/types";
import {
  paginateQuotationItems,
  QUOTATION_PAGE_SIZE,
} from "@/lib/quotations/document";
import { defaultQuotationExpiration } from "@/lib/quotations/validity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AddressSnapshot = {
  recipient_name?: string | null;
  phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  area?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

type CustomerProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
};

type QuotationItem = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  quantity: number | string;
  target_price: number | string | null;
  unit_price: number | string | null;
  discount_amount: number | string | null;
  tax_amount: number | string | null;
  line_subtotal: number | string | null;
  line_total: number | string | null;
  currency: string | null;
};

const text = (value: unknown, fallback = "") => String(value ?? fallback);
const number = (value: unknown) => Number(value ?? 0) || 0;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(normalized));
}

function addressLines(address: AddressSnapshot | null) {
  if (!address) return [];
  return [
    [address.address_line_1, address.address_line_2]
      .filter(Boolean)
      .join(", "),
    [
      address.area,
      address.city,
      address.region,
      address.postal_code,
      address.country_code,
    ]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);
}

function CustomerBlock({
  title,
  name,
  company,
  email,
  phone,
  address,
  taxNumber,
}: {
  title: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: AddressSnapshot | null;
  taxNumber?: string;
}) {
  return (
    <div>
      <p className="border-b border-slate-300 pb-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#1d4ed8]">
        {title}
      </p>
      <p className="mt-2 text-sm font-black text-[#0f2747]">{name}</p>
      {company && company !== name ? (
        <p className="text-xs font-semibold text-slate-700">{company}</p>
      ) : null}
      {addressLines(address ?? null).map((line) => (
        <p key={line} className="text-xs leading-5 text-slate-600">
          {line}
        </p>
      ))}
      {phone ? <p className="text-xs text-slate-600">{phone}</p> : null}
      {email ? <p className="text-xs text-slate-600">{email}</p> : null}
      {taxNumber ? (
        <p className="text-xs text-slate-600">Tax ID: {taxNumber}</p>
      ) : null}
    </div>
  );
}

function DetailRow({
  label: detailLabel,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <p className="flex items-start justify-between gap-4 border-b border-slate-200 py-1 last:border-0">
      <span className="text-slate-500">{detailLabel}</span>
      <span className="text-right font-bold text-[#0f2747]">{value}</span>
    </p>
  );
}

export default async function QuotationDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  await requirePermission("quotations.view");
  const { id } = await params;
  const { data, error } = await createSupabaseAdminClient()
    .from("quotation_requests")
    .select(
      "id,reference,status,subject,message,company_name,customer_tax_identification_number,required_by,expiration_date,created_at,currency,billing_address_snapshot,shipping_address_snapshot,subtotal,discount_amount,tax_amount,total_amount,terms_and_conditions,payment_terms,delivery_information,customer_notes,profiles!quotation_requests_profile_id_fkey(full_name,email,phone,company_name),quotation_request_items(id,product_name_snapshot,sku_snapshot,quantity,target_price,unit_price,discount_amount,tax_amount,line_subtotal,line_total,currency)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const customer = data.profiles as unknown as CustomerProfile | null;
  const rawItems = (data.quotation_request_items ??
    []) as unknown as QuotationItem[];
  const items = rawItems.map((item) => {
    const quantity = number(item.quantity);
    const unitPrice = number(item.unit_price ?? item.target_price);
    const lineSubtotal =
      item.line_subtotal == null
        ? quantity * unitPrice
        : number(item.line_subtotal);
    const lineTotal =
      item.line_total == null
        ? Math.max(
            lineSubtotal -
              number(item.discount_amount) +
              number(item.tax_amount),
            0,
          )
        : number(item.line_total);

    return {
      ...item,
      quantity,
      unitPrice,
      lineSubtotal,
      lineTotal,
    };
  });
  const currency = text(data.currency ?? items[0]?.currency, "BDT");
  const discounts = calculateDocumentDiscounts(
    items,
    data.discount_amount,
  );
  const itemTax = items.reduce(
    (sum, item) => sum + Math.max(0, number(item.tax_amount)),
    0,
  );
  const totalTax = itemTax + Math.max(0, number(data.tax_amount));
  const calculatedSubtotal = items.reduce(
    (sum, item) => sum + item.lineSubtotal,
    0,
  );
  const subtotal =
    number(data.subtotal) || calculatedSubtotal;
  const calculatedTotal = Math.max(
    subtotal - discounts.totalDiscount + totalTax,
    0,
  );
  const total = number(data.total_amount) || calculatedTotal;
  const billing = data.billing_address_snapshot as AddressSnapshot | null;
  const shipping = data.shipping_address_snapshot as AddressSnapshot | null;
  const customerName = text(
    customer?.full_name ??
      data.company_name ??
      customer?.company_name ??
      customer?.email,
    "Customer",
  );
  const companyName = text(
    data.company_name ?? customer?.company_name,
  );
  const pages = paginateQuotationItems(items);
  const expirationDate =
    data.expiration_date ??
    defaultQuotationExpiration(new Date(data.created_at));
  const validityDate = formatDate(expirationDate);
  const downloadName = `${customerName} - ${text(data.reference)}`;
  const customerNote = text(data.customer_notes ?? data.message);

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: white !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .quotation-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="overflow-x-auto bg-slate-200 py-5 print:overflow-visible print:bg-white print:py-0">
        {pages.map((pageItems, pageIndex) => {
          const firstPage = pageIndex === 0;
          const lastPage = pageIndex === pages.length - 1;

          return (
            <main
              key={pageIndex}
              className="quotation-page mx-auto mb-5 flex min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-[13px] text-slate-900 shadow-2xl break-after-page last:mb-0 last:break-after-auto print:shadow-none"
            >
              <header className="border-b-4 border-[#1d4ed8] bg-[#0f2747] px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-white p-1.5 shadow-sm">
                      <Image
                        src="/brand/sen-official-logo.png"
                        alt="SEN"
                        width={48}
                        height={48}
                        priority
                      />
                    </span>
                    <div>
                      <h1 className="text-lg font-black tracking-tight">
                        SHENZHEN ENERGY AND NETWORKS
                      </h1>
                      <p className="mt-1 max-w-[390px] text-[11px] leading-5 text-slate-200">
                        House- 67, Level-3, Laboratory Road, New Elephant Road
                        (Backside of Multiplan Center), Dhaka- 1205
                        <br />
                        Call/WhatsApp: +8801805226599 · sen.com.bd ·
                        szwaqia@vip.163.com
                      </p>
                    </div>
                  </div>
                  <div className="min-w-[175px] text-right">
                    <h2 className="text-2xl font-black tracking-[0.1em]">
                      QUOTATION
                    </h2>
                    <p className="mt-1 font-mono text-xs">
                      {text(data.reference)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-200">
                      Issue: {formatDate(data.created_at)}
                    </p>
                    <p className="text-[11px] font-bold text-blue-200">
                      Valid until: {validityDate}
                    </p>
                    {pages.length > 1 ? (
                      <p className="text-[11px] text-slate-300">
                        Page {pageIndex + 1} of {pages.length}
                      </p>
                    ) : null}
                  </div>
                </div>
              </header>

              {firstPage ? (
                <>
                  <section className="grid grid-cols-[1fr_1fr_0.8fr] gap-6 px-6 py-4">
                    <CustomerBlock
                      title="Quotation for"
                      name={customerName}
                      company={companyName}
                      email={text(customer?.email)}
                      phone={text(billing?.phone ?? customer?.phone)}
                      address={billing}
                      taxNumber={text(
                        data.customer_tax_identification_number,
                      )}
                    />
                    <CustomerBlock
                      title="Deliver to"
                      name={text(
                        shipping?.recipient_name,
                        customerName,
                      )}
                      company={companyName}
                      phone={text(shipping?.phone ?? customer?.phone)}
                      address={shipping}
                    />
                    <div>
                      <p className="border-b border-slate-300 pb-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#1d4ed8]">
                        Quote details
                      </p>
                      <div className="mt-1 text-xs">
                        <DetailRow
                          label="Status"
                          value={label(data.status)}
                        />
                        <DetailRow
                          label="Valid until"
                          value={validityDate}
                        />
                        {data.required_by ? (
                          <DetailRow
                            label="Required by"
                            value={formatDate(data.required_by)}
                          />
                        ) : null}
                        <DetailRow label="Currency" value={currency} />
                      </div>
                    </div>
                  </section>

                  <section className="mx-6 mb-4 border-l-4 border-[#1d4ed8] bg-[#f1f5f9] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#1d4ed8]">
                      Subject
                    </p>
                    <h3 className="mt-1 text-sm font-black text-[#0f2747]">
                      {text(data.subject, "Product quotation")}
                    </h3>
                  </section>
                </>
              ) : (
                <p className="px-6 py-3 text-xs font-semibold text-slate-600">
                  Quotation {text(data.reference)} · continued from page{" "}
                  {pageIndex}
                </p>
              )}

              <section className="px-6">
                <div className="overflow-hidden border border-slate-300">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-[#0f2747] text-white">
                      <tr>
                        <th className="w-[6%] px-2 py-2 text-center">No.</th>
                        <th className="w-[36%] px-2 py-2">Description</th>
                        <th className="w-[8%] px-2 py-2 text-center">Qty</th>
                        <th className="w-[16%] px-2 py-2 text-right">
                          Unit price
                        </th>
                        <th className="w-[12%] px-2 py-2 text-right">
                          Discount
                        </th>
                        <th className="w-[10%] px-2 py-2 text-right">Tax</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.length ? (
                        pageItems.map((item, index) => (
                          <tr
                            key={item.id}
                            className="border-t border-slate-200 even:bg-[#f1f5f9]"
                          >
                            <td className="px-2 py-2 text-center align-top">
                              {pageIndex * QUOTATION_PAGE_SIZE + index + 1}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <b className="text-[#0f2747]">
                                {item.product_name_snapshot}
                              </b>
                              <span className="block font-mono text-[10px] leading-4 text-slate-500">
                                SKU {text(item.sku_snapshot, "—")}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center align-top font-bold">
                              {item.quantity}
                            </td>
                            <td className="px-2 py-2 text-right align-top">
                              {money(item.unitPrice, currency)}
                            </td>
                            <td className="px-2 py-2 text-right align-top">
                              {money(item.discount_amount, currency)}
                            </td>
                            <td className="px-2 py-2 text-right align-top">
                              {money(item.tax_amount, currency)}
                            </td>
                            <td className="px-2 py-2 text-right align-top font-bold">
                              {money(item.lineTotal, currency)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-8 text-center text-slate-500"
                          >
                            No quotation items have been added.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {lastPage ? (
                <section className="px-6 pt-4">
                  <div className="ml-auto w-[48%] text-xs">
                    <DetailRow
                      label="Subtotal"
                      value={money(subtotal, currency)}
                    />
                    <DetailRow
                      label="Discount"
                      value={money(discounts.totalDiscount, currency)}
                    />
                    <DetailRow
                      label="Tax"
                      value={money(totalTax, currency)}
                    />
                    <p className="mt-1 flex justify-between bg-[#0f2747] px-3 py-2 text-sm font-black text-white">
                      <span>Total quoted amount</span>
                      <span>{money(total, currency)}</span>
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4 text-[11px]">
                    <div className="border border-slate-200 bg-[#f8fafc] p-3">
                      <h3 className="font-black uppercase tracking-wide text-[#1d4ed8]">
                        Commercial terms
                      </h3>
                      <div className="mt-2 space-y-2 whitespace-pre-wrap leading-5 text-slate-600">
                        <p>
                          <b className="text-[#0f2747]">Validity:</b>{" "}
                          This quotation is valid until {validityDate}.
                        </p>
                        {data.payment_terms ? (
                          <p>
                            <b className="text-[#0f2747]">Payment:</b>{" "}
                            {data.payment_terms}
                          </p>
                        ) : null}
                        {data.delivery_information ? (
                          <p>
                            <b className="text-[#0f2747]">Delivery:</b>{" "}
                            {data.delivery_information}
                          </p>
                        ) : null}
                        {data.terms_and_conditions ? (
                          <p>
                            <b className="text-[#0f2747]">
                              Terms &amp; conditions:
                            </b>{" "}
                            {data.terms_and_conditions}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="border border-slate-200 bg-[#f8fafc] p-3">
                      <h3 className="font-black uppercase tracking-wide text-[#1d4ed8]">
                        Customer notes
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap leading-5 text-slate-600">
                        {customerNote ||
                          "Availability and delivery schedule will be confirmed before order placement."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-10 grid grid-cols-2 gap-16 text-center text-xs">
                    <p className="border-t border-slate-500 pt-1 font-semibold">
                      Authorized signature
                    </p>
                    <p className="border-t border-slate-500 pt-1 font-semibold">
                      Customer acceptance
                    </p>
                  </div>
                </section>
              ) : null}

              <footer className="mt-auto border-t border-slate-200 px-6 py-3 text-center text-[11px] text-slate-500">
                Thank you for choosing SEN · +8801805226599 · sen.com.bd ·
                szwaqia@vip.163.com
              </footer>
            </main>
          );
        })}

        <div className="mx-auto mt-4 flex max-w-[210mm] gap-3 print:hidden">
          <PrintDocumentButton fileName={downloadName} />
          <Link
            href="/admin/quotations"
            className="rounded-lg border bg-white px-4 py-2 font-semibold"
          >
            Back to quotations
          </Link>
        </div>
      </div>
    </>
  );
}
