import Link from "next/link";

type Summary = { activeUnits: number; activeTenants: number; rentReceived: number; standaloneAdvanceReceived: number; expenses: number; distributableAmount: number };
const root = "/admin/murshida-manzil";
const money = (amount: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(amount);

export function ReadOnlyOverview({ summary, rents, administratorUnlinked }: {
  summary: Summary; rents: { id: string; date: string; tenant: string; amount: number }[]; administratorUnlinked: boolean;
}) {
  return <main>
    <h1 className="text-2xl font-bold">মুর্শিদা মঞ্জিলের হিসাব</h1>
    <p className="mb-5 mt-2 text-sm text-slate-600">ভাড়া, অগ্রিম, খরচ ও মালিকদের রিপোর্ট · শুধু দেখার অনুমতি</p>
    {administratorUnlinked ? <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">আপনার হিসাব পরিচালনার অ্যাক্সেস সেটআপ সম্পূর্ণ হয়নি।</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[["Rent settled", summary.rentReceived], ["Advance received", summary.standaloneAdvanceReceived], ["Expenses", summary.expenses], ["Distributable", summary.distributableAmount]].map(([label, amount]) =>
        <section key={String(label)} className="rounded-xl border bg-white p-5"><h2 className="text-sm text-slate-600">{label}</h2><p className="mt-2 text-xl font-bold">{money(Number(amount))}</p></section>)}
    </div>
    <nav className="my-5 flex flex-wrap gap-3" aria-label="হিসাবের রিপোর্ট">
      {[["ভাড়ার হিসাব", "/history/rent"], ["অগ্রিমের হিসাব", "/history/advance"], ["খরচের হিসাব", "/history/expense"], ["সব মালিকের হিসাব", "/reports/owner-rent-account?owner=all"], ["মাসভিত্তিক আয়", "/reports/monthly-owner-income"]].map(([label, path]) =>
        <Link key={path} href={root + path} prefetch={false} className="rounded-lg border bg-white px-4 py-3 text-sm font-semibold">{label}</Link>)}
    </nav>
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-3 text-lg font-bold">সাম্প্রতিক ভাড়া</h2>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">তারিখ</th><th className="p-2">ভাড়াটিয়া</th><th className="p-2">পরিমাণ</th><th className="p-2">রসিদ</th></tr></thead>
        <tbody>{rents.map(rent => <tr key={rent.id} className="border-t"><td className="p-2">{rent.date}</td><td className="p-2">{rent.tenant}</td><td className="whitespace-nowrap p-2">{money(rent.amount)}</td><td className="p-2"><Link href={`${root}/${rent.id}/rent-receipt`} prefetch={false} className="underline">View / Print</Link></td></tr>)}</tbody></table></div>
      {!rents.length ? <p className="text-sm text-slate-600">এখনো ভাড়া রেকর্ড করা হয়নি।</p> : null}
    </section>
  </main>;
}
