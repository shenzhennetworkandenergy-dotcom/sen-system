import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import { requirePermission } from "@/lib/auth/permissions";
import {
  paginateQuotationItems,
  QUOTATION_PAGE_SIZE,
  resolveQuotationItemAmounts,
  resolveQuotationTotals,
  type QuotationAmountItem,
} from "@/lib/quotations/document";
import { resolveQuotationExpirationDate } from "@/lib/quotations/validity";
import { money } from "@/lib/orders/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Customer = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
};

type QuotationItem = QuotationAmountItem & {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  description_snapshot: string | null;
};

const text = (value: unknown, fallback = "") => String(value ?? fallback);
const dateLabel = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString("en-GB") : "—";

function QuotationHeader({
  reference,
  createdAt,
  validUntil,
  page,
  pages,
}: {
  reference: string;
  createdAt: string;
  validUntil: string;
  page: number;
  pages: number;
}) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-r from-rose-950 via-red-900 to-amber-700 px-6 py-5 text-white">
      <div className="absolute -right-14 -top-24 h-64 w-64 rounded-full border-[24px] border-amber-100/10" />
      <div className="absolute -bottom-20 left-1/3 h-32 w-72 -rotate-6 rounded-[50%] bg-amber-300/10" />
      <div className="relative flex items-start justify-between gap-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-1.5 shadow-lg">
            <Image
              src="/brand/sen-official-logo.png"
              alt="SEN"
              width={48}
              height={48}
              className="h-12 w-12"
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
              Call/WhatsApp: +8801805226599 · sen.com.bd ·
              szwaqia@vip.163.com
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-[0.08em]">QUOTATION</h2>
          <p className="mt-1 font-mono text-xs">{reference}</p>
          <p className="mt-1 text-xs text-white/85">
            Issue: {dateLabel(createdAt)}
          </p>
          <p className="text-xs font-semibold text-amber-100">
            Valid until: {dateLabel(validUntil)}
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

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-4 border-amber-600 bg-amber-50/70 px-4 py-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-900">
        {title}
      </p>
      <div className="mt-1.5 leading-5 text-slate-700">{children}</div>
    </div>
  );
}

function CommercialSection({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <section className="border-t border-amber-200 pt-2">
      <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-rose-900">
        {title}
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">
        {value}
      </p>
    </section>
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
      "id,reference,status,subject,company_name,customer_tax_identification_number,required_by,expiration_date,created_at,subtotal,discount_amount,tax_amount,total_amount,currency,payment_terms,delivery_information,terms_and_conditions,customer_notes,billing_address_snapshot,profiles!quotation_requests_profile_id_fkey(full_name,email,phone,company_name),quotation_request_items(id,product_name_snapshot,sku_snapshot,description_snapshot,quantity,target_price,unit_price,line_total)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const customer = data.profiles as unknown as Customer | null;
  const items = data.quotation_request_items as unknown as QuotationItem[];
  const billing = (data.billing_address_snapshot ?? {}) as Record<
    string,
    unknown
  >;
  const pages = paginateQuotationItems(items);
  const currency = text(data.currency, "BDT");
  const totals = resolveQuotationTotals(data, items);
  const validUntil = resolveQuotationExpirationDate(
    data.expiration_date,
    data.created_at,
  );
  const customerName = text(
    customer?.full_name ?? data.company_name ?? customer?.company_name ?? customer?.email,
    "Customer",
  );
  const companyName = text(data.company_name ?? customer?.company_name);
  const downloadName = `${customerName} - ${data.reference}`;
  const addressLines = [
    [billing.address_line_1, billing.address_line_2]
      .filter(Boolean)
      .map((part) => text(part))
      .join(", "),
    [
      billing.area,
      billing.city,
      billing.region,
      billing.postal_code,
      billing.country_code,
    ]
      .filter(Boolean)
      .map((part) => text(part))
      .join(", "),
  ].filter(Boolean);

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

      <div className="overflow-x-auto bg-stone-200 py-5 print:overflow-visible print:bg-white print:py-0">
        {pages.map((pageItems, pageIndex) => {
          const lastPage = pageIndex === pages.length - 1;

          return (
            <main
              key={pageIndex}
              className="quotation-page mx-auto mb-5 flex min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-[13px] text-slate-900 shadow-2xl break-after-page last:mb-0 last:break-after-auto print:shadow-none"
            >
              <QuotationHeader
                reference={data.reference}
                createdAt={data.created_at}
                validUntil={validUntil}
                page={pageIndex + 1}
                pages={pages.length}
              />

              {pageIndex === 0 ? (
                <>
                  <section className="grid grid-cols-2 gap-5 px-6 py-4">
                    <DetailBlock title="Quotation for">
                      <p className="font-black text-slate-950">{customerName}</p>
                      {companyName && companyName !== customerName ? (
                        <p>{companyName}</p>
                      ) : null}
                      {customer?.email ? <p>{customer.email}</p> : null}
                      {customer?.phone ? <p>{customer.phone}</p> : null}
                      {addressLines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </DetailBlock>
                    <DetailBlock title="Quotation details">
                      <p>
                        <b>Status:</b>{" "}
                        <span className="capitalize">
                          {data.status.replaceAll("_", " ")}
                        </span>
                      </p>
                      <p>
                        <b>Required by:</b> {dateLabel(data.required_by)}
                      </p>
                      <p>
                        <b>Valid until:</b> {dateLabel(validUntil)}
                      </p>
                      {data.customer_tax_identification_number ? (
                        <p>
                          <b>Tax ID:</b>{" "}
                          {data.customer_tax_identification_number}
                        </p>
                      ) : null}
                    </DetailBlock>
                  </section>
                  <section className="px-6 pb-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-900">
                      Subject
                    </p>
                    <h2 className="mt-1 text-base font-black text-slate-950">
                      {data.subject}
                    </h2>
                  </section>
                </>
              ) : (
                <p className="px-6 py-3 text-xs font-semibold text-slate-600">
                  Continued from page {pageIndex}
                </p>
              )}

              <section className="px-6">
                <div className="overflow-hidden border border-stone-300">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-rose-950 text-white">
                      <tr>
                        <th className="w-[7%] px-2 py-2 text-center">No.</th>
                        <th className="w-[43%] px-2 py-2">Description</th>
                        <th className="w-[12%] px-2 py-2 text-center">
                          Quantity
                        </th>
                        <th className="w-[18%] px-2 py-2 text-right">
                          Unit price
                        </th>
                        <th className="px-2 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item, index) => {
                        const amounts = resolveQuotationItemAmounts(item);

                        return (
                          <tr
                            key={item.id || `${pageIndex}-${index}`}
                            className="border-t border-stone-200 even:bg-amber-50/60"
                          >
                            <td className="px-2 py-2 text-center align-top">
                              {pageIndex * QUOTATION_PAGE_SIZE + index + 1}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <b>{item.product_name_snapshot}</b>
                              <span className="block font-mono text-[11px] leading-5 text-slate-600">
                                SKU {item.sku_snapshot || "—"}
                              </span>
                              {item.description_snapshot ? (
                                <span className="mt-0.5 block text-[11px] leading-4 text-slate-600">
                                  {item.description_snapshot}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2 text-center align-top font-bold">
                              {Number(item.quantity)}
                            </td>
                            <td className="px-2 py-2 text-right align-top">
                              {money(amounts.unitPrice, currency)}
                            </td>
                            <td className="px-2 py-2 text-right align-top font-bold">
                              {money(amounts.lineTotal, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {lastPage ? (
                <section className="px-6 pt-4">
                  <div className="ml-auto w-[48%] text-xs">
                    {[
                      ["Subtotal", totals.subtotal],
                      ["Discount", totals.discount],
                      ["Tax", totals.tax],
                    ].map(([name, amount]) => (
                      <p
                        key={text(name)}
                        className="flex justify-between border-b border-stone-200 px-2 py-1.5"
                      >
                        <span>{text(name)}</span>
                        <span>{money(Number(amount), currency)}</span>
                      </p>
                    ))}
                    <p className="mt-1 flex justify-between bg-gradient-to-r from-rose-950 to-red-900 px-3 py-2.5 text-sm font-black text-white">
                      <span>Total quoted amount</span>
                      <span>{money(totals.total, currency)}</span>
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <CommercialSection
                      title="Payment terms"
                      value={data.payment_terms}
                    />
                    <CommercialSection
                      title="Delivery information"
                      value={data.delivery_information}
                    />
                    <CommercialSection
                      title="Terms and conditions"
                      value={data.terms_and_conditions}
                    />
                    <CommercialSection
                      title="Customer notes"
                      value={data.customer_notes}
                    />
                  </div>

                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-950">
                    This quotation remains valid until {dateLabel(validUntil)}.
                    Final availability and delivery timing are confirmed when
                    SEN accepts the order.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-16 text-center text-xs">
                    <p className="border-t border-slate-500 pt-1 font-semibold">
                      Authorized signature
                    </p>
                    <p className="border-t border-slate-500 pt-1 font-semibold">
                      Customer acceptance
                    </p>
                  </div>
                </section>
              ) : null}

              <footer className="mt-auto border-t border-amber-200 px-6 py-3 text-center text-[11px] text-slate-600">
                SEN · +8801805226599 · sen.com.bd · szwaqia@vip.163.com
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
