import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { requireProfile } from "@/lib/auth/session";
import { getDonationExpenseDetail } from "@/lib/donation-expenses/data";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const small = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function words(value: number): string { const n=Math.floor(value); if(n<20)return small[n]; if(n<100)return `${tens[Math.floor(n/10)]}${n%10?` ${small[n%10]}`:""}`; if(n<1000)return `${words(Math.floor(n/100))} Hundred${n%100?` ${words(n%100)}`:""}`; if(n<100000)return `${words(Math.floor(n/1000))} Thousand${n%1000?` ${words(n%1000)}`:""}`; if(n<10000000)return `${words(Math.floor(n/100000))} Lakh${n%100000?` ${words(n%100000)}`:""}`; return `${words(Math.floor(n/10000000))} Crore${n%10000000?` ${words(n%10000000)}`:""}`; }

export default async function DonationVoucherPrintPage({ params }: { params: Promise<{ expenseId: string }> }) {
  await connection(); await requireProfile(["admin"]);
  const { expenseId } = await params;
  const detail = await getDonationExpenseDetail(expenseId);
  if (!detail) notFound();
  const { expense } = detail; const beneficiary = expense.beneficiary!;
  return <main className="mx-auto min-h-screen max-w-4xl bg-white p-8 text-slate-900 print:max-w-none print:p-0">
    <div className="mb-6 flex items-center justify-between gap-3 print:hidden"><Link href={`/admin/donation-expenses/${expense.id}`} className="rounded-lg border px-4 py-2 font-semibold">Back</Link><PrintButton /></div>
    <section className="border-2 border-slate-900 p-8">
      <header className="flex items-center justify-between border-b-2 border-slate-900 pb-5"><div className="flex items-center gap-4"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={82} height={82} /><div><h1 className="text-2xl font-bold">{siteConfig.company.fullName}</h1><p className="text-sm">Donation / Sadaqah / Charity Expense Voucher</p></div></div><div className="text-right"><p className="text-xs uppercase">Voucher Reference</p><strong>{expense.expense_reference}</strong><p className="mt-1 text-sm">Status: {expense.status}</p></div></header>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 py-6 text-sm"><div><p className="text-xs uppercase text-slate-500">Beneficiary</p><strong>{beneficiary.name}</strong><p>{beneficiary.phone || "No phone"}</p><p>{[beneficiary.address, beneficiary.city_district, beneficiary.country].filter(Boolean).join(", ")}</p></div><div><p className="text-xs uppercase text-slate-500">Relationship</p><p>{[beneficiary.relationship_group, beneficiary.relationship_type?.name, beneficiary.relationship_note].filter(Boolean).join(" · ") || "Not specified"}</p></div><div><p className="text-xs uppercase text-slate-500">Donation Date</p><strong>{date(expense.donation_date)}</strong></div><div><p className="text-xs uppercase text-slate-500">Category</p><strong>{expense.category?.name}</strong></div><div><p className="text-xs uppercase text-slate-500">Payment Method</p><strong>{expense.payment_method?.name}</strong><p>{expense.payment_reference || "No reference"}</p></div><div><p className="text-xs uppercase text-slate-500">Proof Reference</p><p>{expense.proof_file_name || "Not attached"}</p></div></div>
      <div className="border-y-2 border-slate-900 py-5"><p className="text-xs uppercase text-slate-500">Amount</p><p className="text-3xl font-bold">{money(Number(expense.amount))}</p><p className="mt-1 text-sm">Taka {words(Number(expense.amount))} Only</p></div>
      <div className="grid grid-cols-2 gap-8 py-6 text-sm"><div><p className="text-xs uppercase text-slate-500">Purpose</p><p>{expense.purpose}</p></div><div><p className="text-xs uppercase text-slate-500">Note</p><p>{expense.note || "—"}</p></div></div>
      <footer className="mt-16 grid grid-cols-3 gap-10 text-center text-sm"><div className="border-t border-slate-900 pt-2">Prepared By</div><div className="border-t border-slate-900 pt-2">Recipient Acknowledgement</div><div className="border-t border-slate-900 pt-2">Approved By</div></footer>
      <p className="mt-8 text-center text-xs text-slate-500">Donation module operational voucher only — not an Accounting or Cashbook voucher.</p>
    </section>
  </main>;
}
