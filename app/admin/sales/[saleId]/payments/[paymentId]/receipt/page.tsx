import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import { siteConfig } from "@/config/site";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { label, money } from "@/lib/orders/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Address = Record<string, unknown>;
type Customer = {
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
};

const text = (value: unknown, fallback = "—") => String(value ?? "").trim() || fallback;
const date = (value: string) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dhaka",
}).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+06:00` : value));

const smallNumbers = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function integerWords(value: number): string {
  const number = Math.floor(value);
  if (number < 20) return smallNumbers[number];
  if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${smallNumbers[number % 10]}` : ""}`;
  if (number < 1_000) return `${integerWords(Math.floor(number / 100))} Hundred${number % 100 ? ` ${integerWords(number % 100)}` : ""}`;
  if (number < 100_000) return `${integerWords(Math.floor(number / 1_000))} Thousand${number % 1_000 ? ` ${integerWords(number % 1_000)}` : ""}`;
  if (number < 10_000_000) return `${integerWords(Math.floor(number / 100_000))} Lakh${number % 100_000 ? ` ${integerWords(number % 100_000)}` : ""}`;
  return `${integerWords(Math.floor(number / 10_000_000))} Crore${number % 10_000_000 ? ` ${integerWords(number % 10_000_000)}` : ""}`;
}

function amountInWords(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 100);
  const taka = Math.floor(rounded / 100);
  const poisha = rounded % 100;
  return `${integerWords(taka)} Taka${poisha ? ` and ${integerWords(poisha)} Poisha` : ""} Only`;
}

function addressLine(address: Address) {
  return [
    address.address_line_1,
    address.address_line_2,
    address.area,
    address.city,
    address.region,
    address.postal_code,
    address.country_code,
  ].filter(Boolean).map((part) => text(part)).join(", ") || "—";
}

function Detail({ name, value }: { name: string; value: string }) {
  return <p className="grid grid-cols-[9.5rem_1rem_1fr] border-b border-dotted border-slate-300 py-1"><span>{name}</span><span>:</span><strong>{value}</strong></p>;
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string; paymentId: string }>;
}) {
  await connection();
  const { profile, permissions } = await requireAnyPermission(["sales.view", "sales.view_all", "sales.view_own"]);
  const { saleId, paymentId } = await params;
  const db = createSupabaseAdminClient();

  const [saleResult, paymentResult, paymentsResult, invoiceResult] = await Promise.all([
    db.from("sales_orders")
      .select("id,order_number,total_amount,currency,created_by,created_at,billing_address_snapshot,shipping_address_snapshot,customer:profiles!sales_orders_customer_profile_id_fkey(full_name,company_name,email,phone)")
      .eq("id", saleId).maybeSingle(),
    db.from("sale_payments")
      .select("id,order_id,amount,payment_date,method,reference_number,internal_note,received_by,status,created_at,profiles!sale_payments_received_by_fkey(full_name,email)")
      .eq("id", paymentId).eq("order_id", saleId).maybeSingle(),
    db.from("sale_payments").select("id,amount,status,created_at").eq("order_id", saleId).order("created_at", { ascending: true }).order("id", { ascending: true }),
    db.from("sale_documents").select("document_number").eq("order_id", saleId).eq("document_type", "invoice").neq("status", "voided").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const sale = saleResult.data;
  const payment = paymentResult.data;
  if (saleResult.error || paymentResult.error || paymentsResult.error || invoiceResult.error || !sale || !payment) notFound();
  if (profile.role === "employee" && !permissions.has("sales.view") && !permissions.has("sales.view_all") && sale.created_by !== profile.id) notFound();

  const receivedPayments = (paymentsResult.data ?? []).filter((row) => row.status === "received");
  const paymentIndex = receivedPayments.findIndex((row) => row.id === payment.id);
  if (paymentIndex < 0 || payment.status !== "received") notFound();
  const previouslyPaid = receivedPayments.slice(0, paymentIndex).reduce((sum, row) => sum + Number(row.amount), 0);
  const thisPayment = Number(payment.amount);
  const paidAfter = previouslyPaid + thisPayment;
  const remaining = Math.max(Number(sale.total_amount) - paidAfter, 0);
  const customerRelation = sale.customer as unknown as Customer | Customer[] | null;
  const customer = (Array.isArray(customerRelation) ? customerRelation[0] : customerRelation) ?? { full_name: null, company_name: null, email: null, phone: null };
  const receiverRelation = payment.profiles as unknown as { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  const receiver = Array.isArray(receiverRelation) ? receiverRelation[0] : receiverRelation;
  const address = (sale.billing_address_snapshot ?? sale.shipping_address_snapshot ?? {}) as Address;
  const receiptNumber = `MR-${payment.payment_date.replaceAll("-", "")}-${payment.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const currency = sale.currency || "BDT";

  return <>
    <style>{`
      @page { size: 8.5in 4.25in; margin: 0; }
      @media print {
        html, body { width: 8.5in !important; height: 4.25in !important; margin: 0 !important; background: white !important; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .money-receipt-sheet { width: 8.5in !important; height: 4.25in !important; margin: 0 !important; box-shadow: none !important; }
        .money-receipt-actions { display: none !important; }
      }
    `}</style>
    <div className="min-h-screen overflow-x-auto bg-slate-200 py-5 print:min-h-0 print:overflow-visible print:bg-white print:py-0">
      <main className="money-receipt-sheet mx-auto flex h-[4.25in] w-[8.5in] flex-col overflow-hidden rounded-xl border border-indigo-200 bg-white text-[10px] text-slate-900 shadow-2xl print:rounded-none print:border-0">
        <header className="grid shrink-0 grid-cols-[1fr_2fr_1.25fr] items-center border-b-2 border-blue-700 bg-gradient-to-r from-indigo-50 via-white to-purple-50 px-5 py-3 print:py-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-white p-1 shadow"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={45} height={43} priority /></span>
          </div>
          <div className="text-center"><h1 className="text-[26px] font-black tracking-[0.08em] text-indigo-950">MONEY RECEIPT</h1><p className="mt-1 text-[9px] text-slate-600">+8801805226599 · sen.com.bd · szwaqia@vip.163.com</p></div>
          <div className="text-right leading-4"><strong className="text-xs text-indigo-950">{siteConfig.company.fullName}</strong><p>House-67, Level-3, Laboratory Road</p><p>New Elephant Road, Dhaka-1205</p></div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-[1.55fr_.85fr] gap-4 px-5 py-3 print:py-2">
          <div>
            <div className="mb-2 grid grid-cols-2 gap-4 text-[11px]"><p><b>Receipt No.:</b> <span className="font-bold text-blue-800">{receiptNumber}</span></p><p className="text-right"><b>Date:</b> <span className="font-bold text-blue-800">{date(payment.payment_date)}</span></p></div>
            <Detail name="Received from" value={text(customer.full_name ?? customer.company_name ?? customer.email, "Customer")} />
            <Detail name="Company" value={text(customer.company_name)} />
            <Detail name="Address" value={addressLine(address)} />
            <div className="grid grid-cols-2 gap-3"><Detail name="Phone" value={text(customer.phone)} /><Detail name="Email" value={text(customer.email)} /></div>
            <Detail name="Sale / Invoice" value={[sale.order_number, invoiceResult.data?.document_number].filter(Boolean).join(" / ")} />
            <div className="grid grid-cols-2 gap-3"><Detail name="Payment method" value={label(payment.method)} /><Detail name="Reference No." value={text(payment.reference_number)} /></div>
            <Detail name="Internal note" value={text(payment.internal_note)} />
            <div className="mt-2 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-2">
              <div className="flex items-center justify-between"><b className="text-[11px] text-indigo-900">Amount Received</b><strong className="text-base text-indigo-900">{money(thisPayment, currency)}</strong></div>
              <p className="text-right text-[10px] font-semibold text-indigo-800">({amountInWords(thisPayment)})</p>
            </div>
          </div>

          <aside className="overflow-hidden rounded-xl border border-indigo-200">
            <h2 className="bg-gradient-to-r from-indigo-100 to-purple-100 px-3 py-2 text-center text-xs font-black text-indigo-900">PAYMENT SUMMARY</h2>
            <div className="space-y-1 px-3 py-2 text-[10px]">
              <Detail name="Total Order / Invoice" value={money(sale.total_amount, currency)} />
              <Detail name="Previously Paid" value={money(previouslyPaid, currency)} />
              <div className="rounded bg-indigo-50 font-bold text-indigo-900"><Detail name="This Payment" value={money(thisPayment, currency)} /></div>
              <Detail name="Total Paid After" value={money(paidAfter, currency)} />
              <Detail name="Remaining Balance" value={money(remaining, currency)} />
            </div>
            {remaining === 0 ? <div className="mx-3 mt-1 rounded-lg border border-green-400 bg-green-50 py-2 text-center"><strong className="text-lg text-green-700">FULLY PAID</strong></div> : <div className="mx-3 mt-1 rounded-lg border border-amber-300 bg-amber-50 py-2 text-center font-bold text-amber-800">BALANCE DUE</div>}
          </aside>
        </section>

        <footer className="grid shrink-0 grid-cols-2 gap-24 px-14 pb-3 text-center text-[10px] print:pb-2"><div className="border-t border-slate-500 pt-1"><b>Received By</b><p>{text(receiver?.full_name ?? receiver?.email)}</p></div><div className="border-t border-slate-500 pt-1 font-semibold">Authorized Signature</div></footer>
      </main>
      <div className="money-receipt-actions mx-auto mt-3 flex w-[8.5in] gap-3 print:hidden"><PrintDocumentButton fileName={`${receiptNumber}-${sale.order_number}`} /><Link href={`/admin/sales/${saleId}`} className="rounded-lg border bg-white px-4 py-2 font-semibold">Back to sale</Link></div>
    </div>
  </>;
}
