import Image from "next/image";

import { LoanPrintButton } from "@/components/receivables/LoanPrintButton";
import { siteConfig } from "@/config/site";
import { amountInWords } from "@/lib/receivables/employee-loans";

type AgreementProps = {
  account: { receivable_number: string; approved_amount: number; currency: string; final_due_date?: string | null };
  detail: Record<string, unknown>;
  employee: Record<string, unknown> | null;
};

function relation(value: unknown) {
  return (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
}

function display(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "" ? "—" : String(value);
}

function identity(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "" ? "________________" : String(value);
}

const frequencyLabels: Record<string, string> = { monthly: "মাসিক / Monthly", weekly: "সাপ্তাহিক / Weekly", daily: "দৈনিক / Daily" };

export function EmployeeLoanAgreement({ account, detail, employee }: AgreementProps) {
  const profile = relation(employee?.profiles);
  const employeeProfile = relation(employee?.hr_employee_profiles);
  const department = relation(employee?.hr_departments);
  const designation = relation(employee?.hr_designations)?.name || employee?.job_title;
  const borrowerName = profile?.full_name;
  const address = employeeProfile?.present_address || employeeProfile?.permanent_address || [profile?.address_line, profile?.city, profile?.region, profile?.postal_code].filter(Boolean).join(", ");
  const approvedAmount = Number(account.approved_amount ?? 0);
  const witnesses = Array.isArray(detail.witnesses) ? detail.witnesses as Array<Record<string, unknown>> : [];
  const representativeName = detail.selected_sen_representative_name_snapshot;
  const representativeDesignation = detail.selected_sen_representative_designation_snapshot;
  const field = (bn: string, en: string, value: unknown) => <div className="grid grid-cols-[minmax(8rem,34%)_minmax(0,1fr)] border-b border-slate-300 last:border-b-0"><dt className="min-w-0 bg-slate-100 px-3 py-1.5 font-semibold">{bn}<span className="block text-[10px] font-normal text-slate-600">{en}</span></dt><dd className="min-w-0 break-words px-3 py-1.5">{display(value)}</dd></div>;
  const footer = <footer className="loan-agreement-footer border-t-4 border-blue-900 pt-1.5 text-center text-[9px] text-slate-600">{siteConfig.company.shortName} · {siteConfig.company.fullName} · Private employee loan agreement · {display(account.receivable_number)}</footer>;
  return <main className="loan-agreement mx-auto text-slate-950">
    <div className="mb-5 flex justify-end print:hidden"><LoanPrintButton /></div>

    <article className="loan-agreement-page page-one">
      <div className="loan-agreement-page-content">
        <header className="border-b-4 border-blue-900 pb-3 text-center">
          <Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={180} height={64} className="mx-auto h-14 w-auto object-contain" priority />
          <h1 className="mt-1 text-lg font-black tracking-wide">{siteConfig.company.fullName}</h1>
          <p className="mt-2 text-base font-bold">বিসমিল্লাহির রাহমানির রাহিম</p>
          <p className="mt-1 text-xs leading-5">পরম করুণাময় ও অসীম দয়ালু আল্লাহর নামে এই ঋণ সংক্রান্ত চুক্তিপত্রের বয়ান আরম্ভ করছি।</p>
          <p className="mt-2 text-2xl font-black">ঋণ গ্রহণ ও পরিশোধ সংক্রান্ত চুক্তিপত্র</p>
          <p className="text-base font-bold tracking-[0.25em]">LOAN AGREEMENT</p>
          <p className="mt-1 text-[10px] text-slate-600">Private SEN company agreement — not a government stamp or security document</p>
        </header>
        <section className="mt-3 grid grid-cols-2 gap-2 border border-blue-900 bg-blue-50 p-2 text-xs"><div className="min-w-0 break-words"><span className="font-semibold">Agreement Reference / চুক্তি রেফারেন্স:</span> {display(detail.agreement_reference)}</div><div className="min-w-0 break-words"><span className="font-semibold">Receivable Reference / রিসিভেবল রেফারেন্স:</span> {display(account.receivable_number)}</div><div className="min-w-0 break-words"><span className="font-semibold">Agreement Date / চুক্তির তারিখ:</span> {display(detail.agreement_date)}</div><div className="min-w-0 break-words"><span className="font-semibold">Currency / মুদ্রা:</span> {display(account.currency)}</div></section>
        <p className="mt-3 text-xs leading-5">এই চুক্তিপত্রটি {siteConfig.company.fullName} (SEN) এবং নিচে উল্লিখিত কর্মচারীর মধ্যে অনুমোদিত ঋণের শর্তাবলি লিখিতভাবে নির্ধারণ করে।</p>
        <section className="mt-3 break-inside-avoid"><h2 className="section-title bg-blue-900 px-3 py-1.5 text-sm font-bold text-white">কর্মচারীর তথ্য <span className="font-normal">| EMPLOYEE INFORMATION</span></h2><dl className="border border-slate-300 text-xs">{field("পূর্ণ নাম", "Full Name", borrowerName)}{field("পিতার নাম", "Father's Name", null)}{field("মাতার নাম", "Mother's Name", null)}{field("জাতীয় পরিচয়পত্র নম্বর", "National ID / NID", employeeProfile?.national_id)}{field("কর্মচারী আইডি", "Employee ID", employee?.employee_number)}{field("পদবী", "Designation", designation)}{field("বিভাগ", "Department", department?.name)}{field("ঠিকানা", "Address", address)}{field("মোবাইল/যোগাযোগ", "Mobile / Contact", profile?.phone)}{field("ইমেইল", "Email", profile?.email)}</dl></section>
      </div>
      {footer}
    </article>

    <article className="loan-agreement-page page-two">
      <div className="loan-agreement-page-content">
        <section className="break-inside-avoid"><h2 className="section-title bg-blue-900 px-3 py-1.5 text-sm font-bold text-white">ঋণের বিবরণ <span className="font-normal">| LOAN DETAILS</span></h2><dl className="border border-slate-300 text-xs">{field("অনুমোদিত ঋণের পরিমাণ", "Approved Loan Amount", `${account.currency} ${approvedAmount.toLocaleString("en-BD", { minimumFractionDigits: 2 })}`)}{field("কথায় পরিমাণ", "Amount in Words", amountInWords(approvedAmount))}{field("ঋণের উদ্দেশ্য", "Loan Purpose", detail.approved_purpose)}{field("পরিশোধের সময়কাল", "Repayment Period", detail.approved_repayment_period)}{field("কিস্তির সংখ্যা", "Number of Installments", detail.approved_installment_count)}{field("কিস্তির ধরন", "Installment Frequency", frequencyLabels[String(detail.installment_frequency ?? "monthly")] ?? detail.installment_frequency)}{field("কিস্তির পরিমাণ", "Installment Amount", `${account.currency} ${Number(detail.approved_monthly_installment ?? 0).toLocaleString("en-BD")}`)}{field("পরিশোধ শুরুর তারিখ", "Repayment Start Date", detail.approved_start_date)}{field("পরিশোধের শেষ তারিখ", "Repayment End Date", account.final_due_date)}{field("মোট পরিশোধযোগ্য পরিমাণ", "Total Repayment Amount", detail.total_repayment_amount)}</dl></section>
        <section className="mt-2 break-inside-avoid rounded border border-slate-300 bg-amber-50 p-3 text-xs"><h2 className="text-sm font-bold">সাক্ষীর তথ্য <span className="font-normal">| WITNESS INFORMATION</span></h2>{witnesses.length ? <div className="mt-2 grid gap-1.5">{witnesses.map((witness, index) => <div key={`${index}-${String(witness.name ?? "")}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] border border-slate-300 bg-white"><strong className="bg-slate-100 p-1.5">সাক্ষী {index + 1}</strong><div className="grid min-w-0 grid-cols-3 gap-1 p-1.5"><span className="min-w-0 break-words"><b>নাম:</b> {display(witness.name)}</span><span className="min-w-0 break-words"><b>ঠিকানা:</b> {display(witness.address)}</span><span className="min-w-0 break-words"><b>ফোন:</b> {display(witness.phone)}</span></div></div>)}</div> : <p className="mt-2">সাক্ষীর তথ্য চুক্তি সম্পাদনের সময় পূরণ করা হবে।</p>}</section>
        <section className="mt-2 break-inside-avoid rounded border border-emerald-300 bg-emerald-50 p-3"><h2 className="text-sm font-bold">কুরআনের নির্দেশনা <span className="font-normal">| QUR&apos;AN GUIDANCE</span></h2><p className="mt-2 text-right text-base leading-7" dir="rtl">يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنْتُمْ بِدَيْنٍ إِلَىٰ أَجَلٍ مُسَمًّى فَاكْتُبُوهُ</p><p className="mt-1 text-xs leading-5">বাংলা অর্থ: “হে মুমিনগণ! তোমরা যখন নির্দিষ্ট সময়ের জন্য পরস্পরের মধ্যে ঋণের লেনদেন করো, তখন তা লিখে রাখো।”</p><p className="mt-1 text-[10px] font-semibold">রেফারেন্স: সূরা আল-বাকারাহ, ২:২৮২</p></section>
        <section className="mt-2 break-inside-avoid rounded border border-indigo-300 bg-indigo-50 p-3"><h2 className="text-sm font-bold">হাদিসের নির্দেশনা <span className="font-normal">| HADITH GUIDANCE</span></h2><p className="mt-2 text-right text-base leading-7" dir="rtl">مَنْ أَخَذَ أَمْوَالَ النَّاسِ يُرِيدُ أَدَاءَهَا أَدَّى اللَّهُ عَنْهُ، وَمَنْ أَخَذَ يُرِيدُ إِتْلَافَهَا أَتْلَفَهُ اللَّهُ</p><p className="mt-1 text-xs leading-5">রাসূলুল্লাহ ﷺ বলেছেন: “যে ব্যক্তি মানুষের সম্পদ নেয় তা পরিশোধ করার ইচ্ছায়, আল্লাহ তার পক্ষ থেকে তা পরিশোধে সাহায্য করেন। আর যে তা নেয় নষ্ট/আত্মসাৎ করার উদ্দেশ্যে, আল্লাহ তাকে ধ্বংস করেন।”</p><p className="mt-1 text-[10px] font-semibold">রেফারেন্স: সহিহ আল-বুখারি, ২৩৮৭</p></section>
      </div>
      {footer}
    </article>

    <article className="loan-agreement-page page-three">
      <div className="loan-agreement-page-content">
        <section className="break-inside-avoid rounded border border-slate-300 bg-white/80 p-3 text-xs leading-5"><h2 className="border-b border-slate-300 pb-1.5 text-sm font-bold">শর্তাবলী <span className="font-normal">| TERMS AND CONDITIONS</span></h2><ol className="mt-2 list-decimal space-y-2 pl-5"><li><strong>ঋণের পরিমাণ ও অনুমোদন:</strong> কর্মচারীর আবেদন, প্রয়োজনীয়তা এবং প্রতিষ্ঠানের অনুমোদনের ভিত্তিতে ঋণের পরিমাণ নির্ধারিত হবে। কর্তৃপক্ষ কর্তৃক অনুমোদিত ঋণের পরিমাণই চূড়ান্ত হিসেবে গণ্য হবে।</li><li><strong>ঋণ পরিশোধের নিয়ম:</strong> ঋণগ্রহীতা স্বাক্ষরিত চুক্তিতে নির্ধারিত সময়সীমা, কিস্তির পরিমাণ এবং পরিশোধের শর্ত অনুযায়ী নিয়মিত ঋণ পরিশোধ করতে বাধ্য থাকবেন।</li><li><strong>কিস্তি বা পরিশোধের শর্ত পরিবর্তন:</strong> বিশেষ বা যৌক্তিক কারণে কিস্তির পরিমাণ, পরিশোধের সময়সূচি অথবা সংশ্লিষ্ট কোনো শর্ত পরিবর্তনের প্রয়োজন হলে তা কর্তৃপক্ষের অনুমোদনক্রমে কার্যকর করা যাবে।</li><li><strong>অগ্রিম ঋণ পরিশোধ:</strong> ঋণগ্রহীতা ইচ্ছা করলে নির্ধারিত সময়সীমার পূর্বে ঋণের আংশিক অথবা সম্পূর্ণ বকেয়া পরিমাণ পরিশোধ করতে পারবেন।</li><li><strong>চাকরি সমাপ্তি বা পদত্যাগের ক্ষেত্রে:</strong> ঋণ সম্পূর্ণ পরিশোধের পূর্বে ঋণগ্রহীতার পদত্যাগ, অব্যাহতি অথবা অন্য কোনো কারণে চাকরির সমাপ্তি ঘটলে অবশিষ্ট ঋণ প্রতিষ্ঠানের প্রচলিত নীতি এবং পারস্পরিক সমঝোতা অনুযায়ী নিষ্পত্তি করা হবে।</li></ol></section>
        <section className="mt-5 break-inside-avoid rounded border border-slate-300 bg-white/80 p-4 text-sm leading-7"><h2 className="text-base font-bold">ঋণগ্রহীতার অঙ্গীকার | BORROWER&apos;S DECLARATION</h2><p className="mt-4">আমি {identity(borrowerName)} অঙ্গীকার করছি যে, উপরোক্ত ঋণের সম্পূর্ণ অর্থ আগামী {identity(account.final_due_date)} তারিখের মধ্যে ঋণদাতাকে পরিশোধ করব।</p><p className="mt-3">এই ঋণ লেনদেন মহান আল্লাহর প্রতি ভয় ও আখিরাতের উপর বিশ্বাসের ভিত্তিতে সম্পাদিত হয়েছে। কোনো পক্ষের উপর কোনো প্রকার জবরদস্তি বা চাপ প্রয়োগ করা হয়নি।</p><p className="mt-3">আমরা উভয় পক্ষ এই চুক্তিপত্রের সকল বক্তব্য পড়ে/শুনে, বুঝে এবং স্বেচ্ছায় সম্মতি প্রদান করে সাক্ষীগণের উপস্থিতিতে স্বাক্ষর করলাম।</p><p className="mt-3">আল্লাহ তাআলা আমাদের এই অঙ্গীকার যথাযথভাবে পালন করার তাওফিক দান করুন। আমিন।</p></section>
        <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid text-sm"><div className="signature-card"><h2 className="font-bold">ঋণগ্রহীতা / Borrower</h2><p className="mt-4 break-words">নাম / Name: {identity(borrowerName)}</p><p className="mt-10 border-b border-slate-700">স্বাক্ষর / Signature:</p><p className="mt-8 border-b border-slate-700">তারিখ / Date:</p></div><div className="signature-card"><h2 className="font-bold">SEN-এর পক্ষে / For and on behalf of SEN</h2><p className="mt-4 break-words">নাম / Name: {identity(representativeName)}</p><p className="mt-2 break-words">পদবী / Designation: {identity(representativeDesignation)}</p><p className="mt-8 border-b border-slate-700">স্বাক্ষর / Signature:</p><p className="mt-8 border-b border-slate-700">তারিখ / Date:</p></div></section>
      </div>
      {footer}
    </article>

    <article className="loan-agreement-page page-four">
      <div className="loan-agreement-page-content">
        <section className="break-inside-avoid"><h2 className="border-b-2 border-blue-900 pb-2 text-base font-bold">সাক্ষীগণের স্বাক্ষর | WITNESS SIGNATURES</h2>{witnesses.length ? <div className="witness-signature-grid mt-4 grid grid-cols-2 gap-4">{witnesses.map((witness, index) => <div key={`witness-signature-${index}-${String(witness.name ?? "")}`} className="witness-signature-card signature-card"><h3 className="font-bold">সাক্ষী {index + 1} / Witness {index + 1}</h3><p className="mt-3 break-words">নাম / Name: {display(witness.name)}</p><p className="mt-2 break-words text-xs">ঠিকানা / Address: {display(witness.address)}</p><p className="mt-1 break-words text-xs">ফোন / Contact: {display(witness.phone)}</p><p className="mt-5 border-b border-slate-700">স্বাক্ষর / Signature:</p><p className="mt-5 border-b border-slate-700">তারিখ / Date:</p></div>)}</div> : <p className="mt-4 text-sm">সাক্ষীর তথ্য চুক্তি সম্পাদনের সময় পূরণ করা হবে।</p>}</section>
      </div>
      {footer}
    </article>

    <style>{`.loan-agreement-page { box-sizing: border-box; display: flex; flex-direction: column; width: 210mm; height: 297mm; margin: 0 auto 1rem; padding: 16mm 16mm 34mm; background-color: #fbfaf6; background-image: url('/brand/document-assets/employee-loan-agreement-a4.png'); background-position: center top; background-size: 210mm 297mm; background-repeat: no-repeat; box-shadow: 0 2px 12px rgb(15 23 42 / 0.12); break-after: page; page-break-after: always; overflow-wrap: anywhere; word-break: break-word; } .loan-agreement-page + .loan-agreement-page { break-before: page; page-break-before: always; } .loan-agreement-page:last-of-type { break-after: auto; page-break-after: auto; } .loan-agreement-page-content, .loan-agreement-page section, .loan-agreement-page dl, .loan-agreement-page div { min-width: 0; } .page-two dt, .page-two dd { padding-top: 0.25rem; padding-bottom: 0.25rem; } .loan-agreement-footer { margin-top: auto; } .signature-card { min-width: 0; min-height: 54mm; border: 1px solid rgb(148 163 184); background: rgb(255 255 255 / 0.78); padding: 1rem; } .witness-signature-card { min-height: 48mm; padding: 0.75rem; } @media print { @page { size: A4 portrait; margin: 0; } html, body { margin: 0 !important; background: transparent !important; } .loan-agreement { margin: 0 !important; } .loan-agreement-page { width: 210mm; height: 297mm; margin: 0; padding: 16mm 16mm 34mm; background-size: 210mm 297mm; background-repeat: no-repeat; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; break-after: page; page-break-after: always; } .loan-agreement-page + .loan-agreement-page { break-before: page; page-break-before: always; } .loan-agreement-page:last-of-type { break-after: auto; page-break-after: auto; } .loan-agreement-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .section-title { break-after: avoid; } }`}</style>
  </main>;
}
