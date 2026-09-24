import { notFound } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { getEmployeeLoanConsent, getEmployeeLoanIdentity } from "@/lib/receivables/employee-loans-data";
import { submitEmployeeLoanApplicationAction } from "../../actions";
import { WitnessFields } from "./WitnessFields";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-lg border px-3 py-2";
const relation = (value: unknown) => (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;

export default async function LoanApplicationFormPage({ searchParams }: { searchParams: Promise<{ consent?: string; error?: string }> }) {
  await connection();
  const query = await searchParams;
  if (!query.consent) notFound();
  const [consent, identity] = await Promise.all([getEmployeeLoanConsent(query.consent), getEmployeeLoanIdentity()]);
  if (!consent.consent || !identity.identity) notFound();
  const employee = identity.identity;
  const profile = relation(employee.profiles);
  return <DashboardShell employeePermissions={[]} title="কর্মচারী ঋণ আবেদনপত্র" subtitle="আপনার পরিচয় লগইন করা কর্মচারী রেকর্ড থেকে নিরাপদভাবে নির্ধারিত হয়েছে।">
    <form action={submitEmployeeLoanApplicationAction} className="mx-auto max-w-4xl space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
      <input type="hidden" name="consent_id" value={consent.consent.id} />
      {query.error ? <p className="rounded-lg bg-red-50 p-3 text-red-800">{query.error}</p> : null}
      <section className="grid gap-4 rounded-xl bg-blue-50 p-4 md:grid-cols-2 xl:grid-cols-3">
        {[["কর্মচারীর নাম",profile?.full_name],["কর্মচারী আইডি",employee.employee_number],["পদবী",relation(employee.hr_designations)?.name || employee.job_title],["বিভাগ",relation(employee.hr_departments)?.name],["মোবাইল/যোগাযোগ",profile?.phone],["ইমেইল",profile?.email]].map(([label,value])=><label key={String(label)} className="text-sm font-semibold">{String(label)}<input className={`${field} bg-slate-100`} value={String(value || "তথ্য পাওয়া যায়নি")} readOnly /></label>)}
      </section>
      <p className="text-xs text-slate-500">এই ফর্ম থেকে কর্মচারী আইডি বা মালিকানার তথ্য পাঠানো হয় না। সার্ভার লগইন করা কর্মচারীর পরিচয় আবার যাচাই করে।</p>
      <section className="grid gap-4 md:grid-cols-2">
        <label>আবেদনকৃত ঋণের পরিমাণ<input className={field} name="requested_amount" type="text" inputMode="numeric" pattern="[0-9]+" required /></label>
        <label>ঋণের উদ্দেশ্য <span className="text-xs text-slate-500">(ঐচ্ছিক)</span><input className={field} name="purpose" maxLength={500} /></label>
      </section>
      <section className="space-y-4 rounded-xl border p-4">
        <h2 className="font-bold">প্রস্তাবিত পরিশোধের সময়কাল</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label>মাস<input className={field} name="repayment_months" type="text" inputMode="numeric" pattern="[0-9]+" defaultValue="0" required /></label>
          <label>দিন<input className={field} name="repayment_days" type="text" inputMode="numeric" pattern="[0-9]+" defaultValue="0" required /></label>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <label>প্রস্তাবিত কিস্তির ধরন<select className={field} name="installment_frequency" required defaultValue="monthly"><option value="monthly">মাসিক</option><option value="weekly">সাপ্তাহিক</option><option value="daily">দৈনিক</option></select></label>
        <label>প্রস্তাবিত কিস্তির পরিমাণ<input className={field} name="proposed_installment" type="text" inputMode="numeric" pattern="[0-9]+" required /></label>
        <label>প্রস্তাবিত কিস্তি শুরু তারিখ<input className={field} name="preferred_start_date" type="date" required /></label>
      </section>
      <label className="block">বিস্তারিত কারণ/ব্যাখ্যা<textarea className={field} name="detailed_explanation" rows={5} required minLength={10} maxLength={4000} /></label>
      <label className="block">অতিরিক্ত মন্তব্য<textarea className={field} name="employee_note" rows={3} maxLength={2000} /></label>
      <WitnessFields />
      <div className="flex flex-wrap gap-3"><Link href="/employee/loans/apply" className="rounded-lg border px-5 py-2.5 font-semibold">Back</Link><button className="rounded-lg bg-blue-800 px-5 py-2.5 font-semibold text-white">Submit Application</button></div>
      <p className="text-xs text-slate-500">আবেদন জমা দিলে কেবল একটি অনুরোধ তৈরি হবে। এতে অর্থ বিতরণ, Accounting/Cash Book পোস্টিং বা Payroll চালু হবে না।</p>
    </form>
  </DashboardShell>;
}
