import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintReportButton } from "@/components/hr/PrintReportButton";
import { siteConfig } from "@/config/site";
import { getHrPayrollVoucher } from "@/lib/hr/operational";

export const dynamic = "force-dynamic";

const numberWords = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tensWords = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function integerWords(value: number): string {
  const amount = Math.floor(value);
  if (amount < 20) return numberWords[amount];
  if (amount < 100) return `${tensWords[Math.floor(amount / 10)]}${amount % 10 ? ` ${numberWords[amount % 10]}` : ""}`;
  if (amount < 1_000) return `${integerWords(Math.floor(amount / 100))} Hundred${amount % 100 ? ` ${integerWords(amount % 100)}` : ""}`;
  if (amount < 100_000) return `${integerWords(Math.floor(amount / 1_000))} Thousand${amount % 1_000 ? ` ${integerWords(amount % 1_000)}` : ""}`;
  if (amount < 10_000_000) return `${integerWords(Math.floor(amount / 100_000))} Lakh${amount % 100_000 ? ` ${integerWords(amount % 100_000)}` : ""}`;
  return `${integerWords(Math.floor(amount / 10_000_000))} Crore${amount % 10_000_000 ? ` ${integerWords(amount % 10_000_000)}` : ""}`;
}

function amountInWords(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 100);
  const taka = Math.floor(rounded / 100);
  const poisha = rounded % 100;
  return `${integerWords(taka)} Taka${poisha ? ` and ${integerWords(poisha)} Poisha` : ""} Only`;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(
    new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+06:00` : value),
  );
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Detail({ label: detailLabel, value }: { label: string; value: string }) {
  return <p className="grid grid-cols-[8.7rem_0.7rem_1fr] border-b border-dotted border-slate-300 py-1"><strong className="text-blue-950">{detailLabel}</strong><span>:</span><span>{value || "—"}</span></p>;
}

function VoucherTable({ title, rows, total, currency, tone }: { title: string; rows: Array<{ name: string; amount: number }>; total: number; currency: string; tone: "earning" | "deduction" }) {
  return <section className="overflow-hidden border border-blue-200">
    <h2 className="bg-gradient-to-r from-blue-950 to-blue-800 px-3 py-1.5 text-center text-[11px] font-black uppercase tracking-wide text-white">{title}</h2>
    <table className="w-full table-fixed text-left text-[10px]"><thead className="bg-blue-50 text-blue-950"><tr><th className="w-8 border-b border-r border-blue-200 px-1.5 py-1 text-center">Sl.</th><th className="border-b border-r border-blue-200 px-2 py-1">Particulars</th><th className="w-28 border-b border-blue-200 px-2 py-1 text-right">Amount (BDT)</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}><td className="border-b border-r border-blue-100 px-1.5 py-1 text-center">{index + 1}</td><td className="border-b border-r border-blue-100 px-2 py-1">{row.name}</td><td className="border-b border-blue-100 px-2 py-1 text-right tabular-nums">{money(row.amount, currency)}</td></tr>)}</tbody><tfoot><tr className={tone === "earning" ? "bg-sky-50" : "bg-indigo-50"}><th colSpan={2} className="border-r border-blue-200 px-2 py-1.5 text-right text-[10px] uppercase text-blue-950">Total {title}</th><th className="px-2 py-1.5 text-right text-[11px] text-blue-950">{money(total, currency)}</th></tr></tfoot></table>
  </section>;
}

export default async function PayrollVoucherPage({ params }: { params: Promise<{ payrollId: string }> }) {
  await connection();
  const { payrollId } = await params;
  const voucher = await getHrPayrollVoucher(payrollId);
  if (!voucher) notFound();

  const earningComponents = voucher.components.filter((component) => component.type === "earning");
  const deductionComponents = voucher.components.filter((component) => component.type === "deduction");
  const listedEarnings = earningComponents.reduce((total, component) => total + component.amount, 0);
  const listedDeductions = deductionComponents.reduce((total, component) => total + component.amount, 0);
  const earnings = [{ name: "Basic Salary", amount: voucher.baseSalary }, ...earningComponents];
  const deductions = [...deductionComponents];
  const remainingEarnings = Math.max(0, voucher.grossPay - voucher.baseSalary - listedEarnings);
  const remainingDeductions = Math.max(0, voucher.deductions - listedDeductions);
  if (remainingEarnings > 0) earnings.push({ name: "Other Earnings", amount: remainingEarnings });
  if (remainingDeductions > 0) deductions.push({ name: "Other Deductions", amount: remainingDeductions });

  return <main className="min-h-screen bg-slate-200 p-5 text-slate-950 print:bg-white print:p-0">
    <style>{`
      @page { size: A4 portrait; margin: 7mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
        body * { visibility: hidden !important; }
        .payroll-voucher, .payroll-voucher * { visibility: visible !important; }
        .payroll-voucher { position: absolute !important; inset: 0 auto auto 0 !important; width: 196mm !important; min-height: 283mm !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .payroll-voucher section, .payroll-voucher footer, .payroll-voucher table { break-inside: avoid; page-break-inside: avoid; }
      }
    `}</style>
    <div className="mx-auto mb-3 flex w-[196mm] justify-between print:hidden"><Link href="/admin/hr/payroll" className="rounded-lg border bg-white px-4 py-2 font-semibold">Back to Payroll</Link><PrintReportButton /></div>
    <article className="payroll-voucher mx-auto flex min-h-[283mm] w-[196mm] flex-col overflow-hidden border border-blue-900 bg-white text-[11px] shadow-2xl">
      <header className="grid grid-cols-[1.15fr_1fr] gap-5 border-b-2 border-blue-900 px-5 py-4">
        <div className="flex items-center gap-3"><span className="grid h-16 w-16 place-items-center border border-blue-100 bg-white p-1"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={56} height={56} className="h-full w-full object-contain" priority /></span><div><h1 className="text-xl font-black tracking-wide text-blue-950">{siteConfig.company.fullName}</h1><p className="mt-1 text-[10px] leading-4 text-slate-700">House-67, Level-3, Laboratory Road<br/>New Elephant Road, Dhaka-1205<br/>+8801805226599 · szwaqia@vip.163.com · sen.com.bd</p></div></div>
        <div className="border-l border-blue-300 pl-5 text-right"><h2 className="text-[25px] font-black leading-tight tracking-wide text-blue-950">SALARY PAYMENT VOUCHER</h2><p className="mt-1 font-bold text-blue-800">(PAYROLL VOUCHER)</p><div className="mt-3 ml-auto grid max-w-[16rem] grid-cols-[5.7rem_0.7rem_1fr] text-left"><strong>Voucher No.</strong><span>:</span><strong className="text-blue-800">{voucher.voucherNumber}</strong><strong className="mt-1">Date</strong><span className="mt-1">:</span><span className="mt-1">{date(voucher.voucherDate)}</span></div></div>
      </header>

      <section className="mx-5 mt-3 grid grid-cols-2 gap-x-7 border border-blue-300 px-4 py-2 text-[10px]">
        <div><Detail label="Employee ID" value={voucher.employee.number} /><Detail label="Employee Name" value={voucher.employee.name} /><Detail label="Designation" value={voucher.employee.designation} /><Detail label="Department" value={voucher.employee.department} /></div>
        <div><Detail label="Salary Month" value={`${date(voucher.periodStart)} – ${date(voucher.periodEnd)}`} /><Detail label="Joining Date" value={date(voucher.employee.joiningDate)} /><Detail label="Employment Type" value={label(voucher.employee.employmentType)} /><Detail label="Work Location" value={voucher.employee.workLocation} /></div>
      </section>

      <section className="mx-5 mt-3 grid grid-cols-2 gap-1"><VoucherTable title="Earnings" rows={earnings} total={voucher.grossPay} currency={voucher.currency} tone="earning" /><VoucherTable title="Deductions" rows={deductions} total={voucher.deductions} currency={voucher.currency} tone="deduction" /></section>

      <section className="mx-5 mt-3 grid grid-cols-[.78fr_1.22fr] gap-2"><div className="flex items-center justify-between bg-blue-950 px-4 py-2 text-white"><strong className="text-sm uppercase tracking-wide">Net Payable</strong><strong className="text-lg tabular-nums">{money(voucher.netPay, voucher.currency)}</strong></div><div className="border border-blue-300 px-4 py-2"><strong className="text-blue-950">In Words (BDT): </strong><span className="italic">{amountInWords(voucher.netPay)}</span></div></section>

      <section className="mx-5 mt-3 grid grid-cols-3 border border-blue-300 text-[10px]"><Detail label="Payment Method" value="N/A" /><Detail label="Payment Date" value="N/A" /><Detail label="Payment Reference" value="N/A" /></section>
      <p className="mx-5 mt-3 text-[10px] text-slate-700">This voucher is generated from the existing payroll record. Current payroll status: <strong className="uppercase text-blue-900">{label(voucher.status)}</strong>{voucher.notes ? ` · Note: ${voucher.notes}` : ""}</p>

      <footer className="mx-5 mt-auto grid grid-cols-4 border border-blue-300 text-center text-[10px]"><Signature title="Prepared By" value={voucher.preparedBy} /><Signature title="Checked By" value="" /><Signature title="Approved By" value={voucher.approvedBy} /><Signature title="Received By (Employee)" value="" /></footer>
      <p className="mx-5 mb-3 mt-2 text-center text-[9px] italic text-slate-500">This is a computer-generated payroll voucher. Signature fields are provided for office use.</p>
    </article>
  </main>;
}

function Signature({ title, value }: { title: string; value: string }) {
  return <div className="min-h-20 border-r border-blue-300 px-3 py-3 last:border-r-0"><strong className="uppercase text-blue-950">{title}</strong><div className="mt-8 border-t border-slate-500 pt-1 text-left"><span>Name: </span>{value || ""}</div><div className="mt-2 border-t border-slate-300 pt-1 text-left">Date:</div></div>;
}
