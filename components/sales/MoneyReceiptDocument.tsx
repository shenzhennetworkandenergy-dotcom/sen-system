import Image from "next/image";
import Link from "next/link";

import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import { siteConfig } from "@/config/site";
import { label, money } from "@/lib/orders/types";

type MoneyReceiptAddress = {
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

type MoneyReceiptPerson = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
};

type MoneyReceiptPayment = {
  id: string;
  amount: number | string;
  payment_date: string;
  method: string;
  reference_number: string | null;
  status: string;
  received_by: {
    id: string;
    full_name: string | null;
  };
};

type MoneyReceiptSummary = {
  previously_paid: number | string;
  this_payment: number | string;
  total_paid: number | string;
  remaining: number | string;
  status: string;
};

type MoneyReceiptSnapshotView = {
  receipt_number: string;
  receipt_date: string;
  generated_at: string;
  sale: {
    id: string;
    order_number: string;
    total_amount: number | string;
    currency?: string | null;
  };
  customer: MoneyReceiptPerson;
  contact: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
  address: MoneyReceiptAddress;
  payment: MoneyReceiptPayment;
  invoice_number?: string | null;
  summary: MoneyReceiptSummary;
  amount_in_words: string;
};

export type MoneyReceiptRecord = {
  id: string;
  payment_id: string;
  order_id: string;
  receipt_number: string;
  receipt_date: string;
  created_at: string;
  snapshot: MoneyReceiptSnapshotView;
};

const text = (value: unknown, fallback = "—") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

function formatDate(value: string) {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" }).format(new Date(normalized));
}

function formatDateTime(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(value));
}

function formatAddressLines(address: MoneyReceiptAddress) {
  return [
    [address.address_line_1, address.address_line_2].filter(Boolean).map((part) => text(part)).join(", "),
    [address.area, address.city, address.region, address.postal_code, address.country_code].filter(Boolean).map((part) => text(part)).join(", "),
  ].filter(Boolean);
}

function InfoBlock({
  title,
  name,
  company,
  lines,
  phone,
  email,
}: {
  title: string;
  name: string;
  company?: string | null;
  lines?: string[];
  phone?: string | null;
  email?: string | null;
}) {
  return (
    <div>
      <p className="border-b border-slate-300 pb-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#1d4ed8]">
        {title}
      </p>
      <p className="mt-2 text-sm font-black text-[#0f2747]">{name}</p>
      {company ? <p className="text-xs font-semibold text-slate-700">{company}</p> : null}
      {lines?.map((line) => (
        <p key={line} className="text-xs leading-5 text-slate-600">
          {line}
        </p>
      )) ?? null}
      {phone ? <p className="text-xs text-slate-600">{phone}</p> : null}
      {email ? <p className="text-xs text-slate-600">{email}</p> : null}
    </div>
  );
}

function DetailRow({ label: rowLabel, value }: { label: string; value: string }) {
  return (
    <p className="flex items-start justify-between gap-4 border-b border-slate-200 py-1 last:border-0">
      <span className="text-slate-500">{rowLabel}</span>
      <span className="text-right font-bold text-[#0f2747]">{value}</span>
    </p>
  );
}

export function MoneyReceiptDocument({
  receipt,
  saleHref,
}: {
  receipt: MoneyReceiptRecord;
  saleHref: string;
}) {
  const snapshot = receipt.snapshot;
  const currency = text(snapshot.sale.currency, "BDT");
  const customerName = text(
    snapshot.customer.full_name ??
      snapshot.customer.company_name ??
      snapshot.contact.full_name ??
      snapshot.contact.email,
    "Customer",
  );
  const printFileName = `${customerName} - ${snapshot.receipt_number}`;

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: white !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .sen-money-receipt-page { box-shadow: none !important; margin: 0 !important; }
          .sen-money-receipt-actions { display: none !important; }
        }
      `}</style>

      <div className="overflow-x-auto bg-slate-200 py-5 print:overflow-visible print:bg-white print:py-0">
        <main className="sen-money-receipt-page mx-auto mb-5 flex min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-[13px] text-slate-900 shadow-2xl break-after-page last:mb-0 last:break-after-auto print:shadow-none">
          <header className="border-b-4 border-blue-700 bg-slate-900 px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-white p-1.5 shadow-sm">
                  <Image
                    src={siteConfig.brandAsset.logo}
                    alt={siteConfig.company.logoAlt}
                    width={48}
                    height={46}
                    className="block"
                    priority
                  />
                </span>
                <div>
                  <h1 className="text-lg font-black uppercase tracking-tight">
                    {siteConfig.company.fullName}
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
              <div className="min-w-[180px] text-right">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Money Receipt
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-[0.1em]">
                  MONEY RECEIPT
                </h2>
                <p className="mt-1 font-mono text-xs">
                  {snapshot.receipt_number}
                </p>
                <p className="mt-1 text-[11px] text-slate-200">
                  Receipt date: {formatDate(snapshot.receipt_date)}
                </p>
                <p className="text-[11px] text-slate-300">
                  Generated: {formatDateTime(snapshot.generated_at)}
                </p>
              </div>
            </div>
          </header>

          <section className="grid grid-cols-3 gap-4 px-6 py-4">
            <InfoBlock
              title="Customer"
              name={customerName}
              company={snapshot.customer.company_name}
              phone={snapshot.customer.phone}
              email={snapshot.customer.email}
            />
            <InfoBlock
              title="Contact"
              name={text(snapshot.contact.full_name, customerName)}
              phone={snapshot.contact.phone}
              email={snapshot.contact.email}
            />
            <InfoBlock
              title="Address"
              name={text(snapshot.address.recipient_name, customerName)}
              phone={snapshot.address.phone}
              lines={formatAddressLines(snapshot.address)}
            />
          </section>

          <section className="px-6">
            <div className="grid gap-4 rounded-xl border border-slate-300 bg-slate-50 p-4 md:grid-cols-[1.05fr_.95fr]">
              <div className="space-y-1 text-xs">
                <DetailRow label="Sale reference" value={text(snapshot.sale.order_number)} />
                <DetailRow label="Sale total" value={money(snapshot.sale.total_amount, currency)} />
                <DetailRow label="Payment date" value={formatDate(snapshot.payment.payment_date)} />
                <DetailRow label="Payment amount" value={money(snapshot.payment.amount, currency)} />
                <DetailRow label="Payment method" value={label(snapshot.payment.method)} />
                <DetailRow label="Reference number" value={text(snapshot.payment.reference_number)} />
                <DetailRow
                  label="Received by"
                  value={text(snapshot.payment.received_by.full_name ?? snapshot.payment.received_by.id)}
                />
                <DetailRow label="Payment status" value={label(snapshot.payment.status)} />
                {snapshot.invoice_number ? (
                  <DetailRow label="Invoice reference" value={snapshot.invoice_number} />
                ) : null}
              </div>
              <div className="rounded-xl border border-cyan-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-900">
                  Amount in words
                </p>
                <p className="mt-2 text-base font-black leading-6 text-slate-950">
                  {snapshot.amount_in_words}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 px-6 pt-4 md:grid-cols-[1fr_1fr]">
            <div className="overflow-hidden rounded-xl border border-slate-300">
              <div className="bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">
                Payment snapshot
              </div>
              <div className="space-y-1 p-4 text-xs">
                <DetailRow label="Amount" value={money(snapshot.payment.amount, currency)} />
                <DetailRow label="Date" value={formatDate(snapshot.payment.payment_date)} />
                <DetailRow label="Method" value={label(snapshot.payment.method)} />
                <DetailRow label="Reference" value={text(snapshot.payment.reference_number)} />
                <DetailRow
                  label="Received by"
                  value={text(snapshot.payment.received_by.full_name ?? snapshot.payment.received_by.id)}
                />
                <DetailRow label="Status" value={label(snapshot.payment.status)} />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-300">
              <div className="bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">
                Historical summary
              </div>
              <div className="space-y-1 p-4 text-xs">
                <DetailRow label="Previously paid" value={money(snapshot.summary.previously_paid, currency)} />
                <DetailRow label="This payment" value={money(snapshot.summary.this_payment, currency)} />
                <DetailRow label="Total paid" value={money(snapshot.summary.total_paid, currency)} />
                <DetailRow label="Remaining" value={money(snapshot.summary.remaining, currency)} />
                {/* label(snapshot.summary.status) */}
                <DetailRow
                  label="Status"
                  value={snapshot.summary.status === "PARTIAL PAYMENT" ? "PARTIAL PAYMENT" : "FULL PAYMENT"}
                />
              </div>
            </div>
          </section>

          <footer className="mt-auto px-6 pb-6 pt-6">
            <div className="grid grid-cols-2 gap-16 text-center text-xs">
              <p className="border-t border-slate-500 pt-1 font-semibold">
                Authorized signature
              </p>
              <p className="border-t border-slate-500 pt-1 font-semibold">
                Customer signature
              </p>
            </div>
            <p className="mt-6 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">
              Money receipt issued against sale {text(snapshot.sale.order_number)} ·
              {` ${siteConfig.company.shortName}`} · {siteConfig.company.fullName}
            </p>
          </footer>
        </main>

        <div className="sen-money-receipt-actions mx-auto mt-4 flex max-w-[210mm] gap-3 print:hidden">
          <PrintDocumentButton fileName={printFileName} />
          <Link href={saleHref} className="rounded-lg border bg-white px-4 py-2 font-semibold">
            Back to sale
          </Link>
        </div>
      </div>
    </>
  );
}
