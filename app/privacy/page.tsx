import type { Metadata } from "next";

import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How SEN handles website, account, quotation and customer support information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <MarketingPage eyebrow="Legal" title="Privacy Policy" description="SEN uses customer information only for account service, quotations, orders, delivery, payments and requested support.">
      <article className="max-w-4xl space-y-6 rounded-2xl border bg-white p-6 leading-7 text-slate-700 shadow-sm sm:p-8">
        <section><h2 className="text-xl font-semibold text-slate-950">Information we collect</h2><p className="mt-2">Account details, company and contact information, delivery addresses, quotation requirements, order records, payments and messages that you submit.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-950">How it is used</h2><p className="mt-2">To provide quotations, verify products, process orders, coordinate delivery, maintain business records, prevent abuse and respond to support requests.</p></section>
        <section><h2 className="text-xl font-semibold text-slate-950">Contact</h2><p className="mt-2">For a privacy question or correction request, contact szwaqia@vip.163.com.</p></section>
      </article>
    </MarketingPage>
  );
}
