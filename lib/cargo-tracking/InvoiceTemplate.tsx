import type { ReactNode } from "react";
import { PrintButton } from "./InvoicePrintButton";

type InvoiceTemplateProps = {
  job: any;
  invoice: any;
  packages?: any[];
  customer?: any;
  showPrint?: boolean;
};

const contact = "House 6-7, Level-3, Laboratory Road, New Elephant Road, Dhaka-1205";
const phone = "+8801805228599";
const email = "szwaqgja@vip.163.com";

export function CargoInvoiceTemplate({ job, invoice, packages = [], customer, showPrint = true }: InvoiceTemplateProps) {
  const total = Number(invoice.total_amount ?? 0);
  const finalWeight = Number(invoice.final_billable_weight_kg ?? 0);
  const rate = Number(invoice.applied_rate_per_kg ?? 0);
  const displayPackages = packages.length ? packages : [{ description: job.goods_summary || "Cargo service", quantity: 1, unit: "Job", weight: null }];
  const paymentLabel = total === 0 ? "ZERO / NO PAYMENT REQUIRED" : invoice.payment_status === "PAID" ? "PAID" : "UNPAID";

  return <main className="mx-auto max-w-5xl bg-white text-slate-900 shadow-xl print:shadow-none">
    <header className="relative overflow-hidden bg-gradient-to-r from-[#063b72] via-[#07589a] to-[#0b6eb5] px-8 py-7 text-white print:px-6 print:py-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-xl bg-white text-xl font-black text-[#07589a] shadow">SEN</div><div><h1 className="text-2xl font-black tracking-tight">SHENZHEN ENERGY AND NETWORKS</h1><p className="mt-1 text-xs text-blue-100">{contact}</p><p className="text-xs text-blue-100">Call/WhatsApp: {phone} · {email}</p></div></div>
        <div className="text-right"><p className="text-3xl font-black uppercase leading-none">Cargo</p><p className="text-2xl font-black uppercase leading-none">Service Invoice</p><p className="mt-2 text-[10px] font-semibold tracking-[0.35em] text-blue-100">GLOBAL SHIPPING SOLUTIONS</p><p className="mt-1 text-[10px] font-semibold tracking-wide text-blue-100">CHINA → BANGLADESH → YOUR DOOR</p></div>
      </div>
    </header>

    <div className="space-y-7 p-8 print:space-y-5 print:p-6">
      <section className="grid gap-6 md:grid-cols-3">
        <InfoBlock title="INVOICE TO"><p className="font-bold">{customer?.full_name || customer?.company_name || "Cargo Customer"}</p><p>{customer?.company_name || ""}</p><p>{customer?.address || customer?.customer_address || "Address not provided"}</p><p>{customer?.phone || ""}</p><p>{customer?.email || ""}</p></InfoBlock>
        <InfoBlock title="DELIVERY DESTINATION"><p className="font-bold">{job.customer_contact_person || customer?.full_name || "Cargo recipient"}</p><p>{job.customer_service_location || job.bangladeshWarehouse?.address || job.bangladeshWarehouse?.name || "Bangladesh"}</p><p>{job.customer_contact_phone || customer?.phone || ""}</p></InfoBlock>
        <InfoBlock title="INVOICE DETAILS"><p>Invoice No. <b>{invoice.invoice_number}</b></p><p>Invoice Date <b>{invoice.invoice_date}</b></p><p>Related Cargo Job <b>{job.internal_cargo_id}</b></p><p>Tracking Number <b>{job.courier_tracking_number || "Not assigned"}</b></p><p>Currency <b>BDT</b></p><p>Status <b className={total === 0 || invoice.payment_status === "PAID" ? "text-emerald-700" : "text-amber-700"}>{paymentLabel}</b></p></InfoBlock>
      </section>

      <section><h2 className="mb-3 border-b-2 border-blue-200 pb-2 text-lg font-black text-[#07589a]">CARGO SERVICE INFORMATION</h2><div className="grid gap-px overflow-hidden rounded-xl bg-blue-100 sm:grid-cols-5"><Metric label="Shipping Method" value={String(job.shipping_method || "—").replaceAll("_", " ")} /><Metric label="Origin" value={job.chinaWarehouse?.name || "China"} /><Metric label="Destination" value={job.bangladeshWarehouse?.address || job.bangladeshWarehouse?.name || "Dhaka, Bangladesh"} /><Metric label="Bangladesh Warehouse" value={job.bangladeshWarehouse?.name || "—"} /><Metric label="Received at BD" value={job.received_bd_at ? new Date(job.received_bd_at).toLocaleDateString("en-GB") : "—"} /></div></section>

      <section><h2 className="mb-3 border-b-2 border-blue-200 pb-2 text-lg font-black text-[#07589a]">PACKAGES &amp; CHARGES</h2><div className="overflow-hidden rounded-xl border"><table className="w-full text-sm"><thead className="bg-[#07589a] text-left text-white"><tr><th className="p-3">No.</th><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Actual Weight (kg)</th><th className="p-3 text-right">Billable Weight (kg)</th><th className="p-3 text-right">Rate / kg (BDT)</th><th className="p-3 text-right">Amount (BDT)</th></tr></thead><tbody>{displayPackages.map((item, index) => <tr key={item.id ?? index} className="border-t"><td className="p-3">{index + 1}</td><td className="p-3 font-semibold">{item.description}</td><td className="p-3 text-right">{item.quantity ?? 1}</td><td className="p-3 text-right">{item.weight == null ? "—" : Number(item.weight).toFixed(2)}</td><td className="p-3 text-right">{index === 0 ? finalWeight.toFixed(2) : "—"}</td><td className="p-3 text-right">{index === 0 ? rate.toLocaleString() : "—"}</td><td className="p-3 text-right">{index === 0 ? total.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</td></tr>)}</tbody></table></div><div className="ml-auto mt-3 max-w-sm overflow-hidden rounded-xl border"><SummaryRow label="Subtotal" value={total} /><SummaryRow label="Other Charges" value={0} /><div className="flex justify-between bg-[#07589a] px-4 py-3 text-lg font-black text-white"><span>Total Amount</span><span>BDT {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div></div></section>

      <section className="grid gap-5 md:grid-cols-2"><div className="rounded-xl border border-blue-100 bg-blue-50 p-5"><h2 className="font-black text-[#07589a]">CARGO NOTES</h2><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm"><li>This invoice is for Cargo Shipping Service only.</li><li>Delivery/handover is subject to Cargo operational clearance.</li><li>Please contact SEN for questions regarding this shipment.</li></ol></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-5"><h2 className="font-black text-[#07589a]">PAYMENT INFORMATION</h2><p className="mt-3 text-sm">{total === 0 ? "No payment required for this Cargo Invoice." : invoice.payment_status === "PAID" ? "Payment Confirmed" : "Please make payment according to this Cargo Service Invoice. Cargo handover will be available after payment confirmation."}</p></div></section>
      <section className="grid gap-12 pt-5 text-center text-sm sm:grid-cols-2"><div className="border-t-2 pt-2 font-semibold">Authorized Signature</div><div className="border-t-2 pt-2 font-semibold">Customer Acceptance</div></section>
      <footer className="border-t pt-5 text-center text-sm text-slate-500"><p>Thank you for choosing SEN · {phone} · sen.com.bd · {email}</p><p className="mt-1 font-semibold italic text-blue-600">— Your Trusted Partner in Global Logistics —</p>{showPrint ? <div className="mt-4 print:hidden"><PrintButton /></div> : null}</footer>
    </div>
  </main>;
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-4 text-sm leading-6"><h2 className="mb-2 font-black text-[#07589a]">{title}</h2>{children}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="bg-blue-50 p-3"><p className="text-xs font-bold text-blue-700">{label}</p><p className="mt-1 text-sm font-semibold capitalize">{value}</p></div>; }
function SummaryRow({ label, value }: { label: string; value: number }) { return <div className="flex justify-between border-b px-4 py-2"><span>{label}</span><span>BDT {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>; }
