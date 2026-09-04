import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { siteConfig } from "@/config/site";
import { requireProfile } from "@/lib/auth/session";
import { getWarehouseExpenseVoucher } from "@/lib/warehouse-expenses/data";
import { PrintButton } from "../../PrintButton";

export const dynamic = "force-dynamic";

const small = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function words(value: number): string { const n=Math.floor(value); if(n<20)return small[n]; if(n<100)return `${tens[Math.floor(n/10)]}${n%10?` ${small[n%10]}`:""}`; if(n<1000)return `${words(Math.floor(n/100))} Hundred${n%100?` ${words(n%100)}`:""}`; if(n<100000)return `${words(Math.floor(n/1000))} Thousand${n%1000?` ${words(n%1000)}`:""}`; if(n<10000000)return `${words(Math.floor(n/100000))} Lakh${n%100000?` ${words(n%100000)}`:""}`; return `${words(Math.floor(n/10000000))} Crore${n%10000000?` ${words(n%10000000)}`:""}`; }
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 2 }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"short", year:"numeric", timeZone:"UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—";

export default async function WarehouseExpensePrintPage({ params }: { params: Promise<{ voucherId: string }> }) {
  await connection(); await requireProfile(["admin"]);
  const { voucherId } = await params;
  const voucher = await getWarehouseExpenseVoucher(voucherId);
  if (!voucher) notFound();
  const month = new Intl.DateTimeFormat("en-GB", { month:"long", year:"numeric", timeZone:"UTC" }).format(new Date(`${voucher.voucher_month}T00:00:00Z`));
  const voucherNo = `WEV-${voucher.voucher_month.slice(0,7).replace("-","")}-${voucher.id.replaceAll("-","").slice(0,6).toUpperCase()}`;
  const lines = [["Office Rent + Mostofa Living",voucher.rent_amount],["Electricity Bill",voucher.electricity_amount],["Mostofa Food / Meal Expense",voucher.staff_food_amount],["Other Expense",voucher.other_amount]] as const;
  return <main className="min-h-screen bg-slate-200 p-5 text-slate-950 print:bg-white print:p-0">
    <style>{`@page{size:A4 portrait;margin:8mm}@media print{html,body{margin:0!important;background:white!important}.voucher-actions{display:none!important}.warehouse-voucher{width:194mm!important;min-height:281mm!important;margin:0!important;box-shadow:none!important;border:0!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.warehouse-voucher section,.warehouse-voucher footer,.warehouse-voucher table{break-inside:avoid;page-break-inside:avoid}}`}</style>
    <div className="voucher-actions mx-auto mb-3 flex w-[194mm] justify-between"><Link href="/admin/warehouse-expenses" className="rounded-lg border bg-white px-4 py-2 font-semibold">Back to vouchers</Link><PrintButton /></div>
    <article className="warehouse-voucher mx-auto flex min-h-[281mm] w-[194mm] flex-col border border-blue-900 bg-white shadow-2xl">
      <header className="grid grid-cols-[1.15fr_.85fr] gap-5 border-b-2 border-blue-950 px-7 py-6"><div className="flex items-center gap-4"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={72} height={72} priority/><div><h1 className="text-xl font-black text-blue-950">{siteConfig.company.fullName}</h1><p className="mt-1 text-[11px] leading-5">House-67, Level-3, Laboratory Road<br/>New Elephant Road, Dhaka-1205<br/>+8801805226599 · szwaqia@vip.163.com · sen.com.bd</p></div></div><div className="border-l border-blue-300 pl-5 text-right"><h2 className="text-2xl font-black leading-tight text-blue-950">WAREHOUSE MONTHLY<br/>EXPENSE VOUCHER</h2><p className="mt-3"><b>Voucher No:</b> {voucherNo}</p><p><b>Status:</b> <span className="uppercase">{voucher.status}</span></p></div></header>
      <section className="mx-7 mt-5 grid grid-cols-2 gap-x-8 border border-blue-300 bg-blue-50/40 p-4 text-sm"><Info label="Voucher Month" value={month}/><Info label="Warehouse" value={`${voucher.warehouses?.name ?? "—"} (${voucher.warehouses?.code ?? "—"})`}/><Info label="Payee Organization" value={voucher.payee_organization}/><Info label="Contact Person" value={voucher.contact_person ?? "—"}/><Info label="Address" value={voucher.payee_address ?? voucher.warehouses?.address ?? "—"}/><Info label="Phone" value={voucher.payee_phone ?? "—"}/></section>
      <section className="mx-7 mt-5"><table className="w-full border-collapse text-sm"><thead className="bg-blue-950 text-white"><tr><th className="w-14 border border-blue-800 p-3">Sl.</th><th className="border border-blue-800 p-3 text-left">Expense Particulars</th><th className="w-48 border border-blue-800 p-3 text-right">Amount (BDT)</th></tr></thead><tbody>{lines.map(([label,value],index)=><tr key={label}><td className="border border-blue-200 p-3 text-center">{index+1}</td><td className="border border-blue-200 p-3">{label}</td><td className="border border-blue-200 p-3 text-right tabular-nums">{money(Number(value))}</td></tr>)}</tbody><tfoot><tr className="bg-blue-50 text-blue-950"><th colSpan={2} className="border border-blue-300 p-3 text-right text-base">TOTAL PAYABLE</th><th className="border border-blue-300 p-3 text-right text-lg">{money(Number(voucher.total_amount))}</th></tr></tfoot></table></section>
      <section className="mx-7 mt-4 border border-blue-300 p-4 text-sm"><b className="text-blue-950">Amount in Words: </b>{words(Number(voucher.total_amount))} Taka Only</section>
      <section className="mx-7 mt-4 grid grid-cols-3 gap-4 border border-blue-300 p-4 text-sm"><Info label="Payment Date" value={date(voucher.payment_date)}/><Info label="Payment Method" value={voucher.payment_method ?? "—"}/><Info label="Payment Reference" value={voucher.payment_reference ?? "—"}/></section>
      {voucher.note ? <section className="mx-7 mt-4 rounded border border-slate-300 p-4 text-sm"><b>Note: </b>{voucher.note}</section> : null}
      <footer className="mx-7 mb-7 mt-auto grid grid-cols-3 gap-10 text-center text-sm"><Signature label="Prepared By"/><Signature label="Approved By"/><Signature label="Received By / Signature"/></footer>
    </article>
  </main>;
}

function Info({label,value}:{label:string;value:string}){return <p className="grid grid-cols-[8rem_.6rem_1fr] border-b border-dotted border-slate-300 py-1.5"><b>{label}</b><span>:</span><span>{value}</span></p>}
function Signature({label}:{label:string}){return <div className="border-t border-slate-600 pt-2 font-semibold">{label}</div>}
