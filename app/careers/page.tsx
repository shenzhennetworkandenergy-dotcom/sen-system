import type { Metadata } from "next";

import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = {
  title: "Careers",
  description: "Career and collaboration opportunities with SEN.",
  alternates: { canonical: "/careers" },
};

export default function CareersPage() {
  return (
    <MarketingPage eyebrow="Careers" title="Build practical technology projects with SEN." description="We welcome experienced people in enterprise technology, sourcing, sales, logistics and customer support.">
      <section className="max-w-3xl rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-semibold">Introduce yourself</h2>
        <p className="mt-4 leading-7 text-slate-700">Send a concise introduction, your experience and the role you are interested in to <a className="font-semibold text-blue-700 underline" href="mailto:szwaqia@vip.163.com">szwaqia@vip.163.com</a>. SEN will contact candidates when a suitable opportunity is available.</p>
      </section>
    </MarketingPage>
  );
}
